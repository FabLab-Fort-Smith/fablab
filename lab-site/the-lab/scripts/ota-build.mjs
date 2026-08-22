#!/usr/bin/env node
// Build + SIGN an OTA firmware bundle (design #144, slice 5). Produces a blob + a signed manifest
// the socket-server serves and the device verifies. Reuses vps/lib/otaManifest.js so the exact
// canonical + Ed25519 the device checks is the one we sign with.
//
// Blob per role:
//   pico    → JSON {"files": {"<name>": "<base64>", ...}} (sorted keys; MicroPython has no tar)
//   pi-zero → deterministic gzip tarball of the release .py files
// The blob's SHA-256 is pinned in the signed manifest; `size` bounds the device download.
//
// Signing key: DOOR_FW_SIGNING_KEY (Ed25519 pkcs8 DER base64) from the environment — in CI it is a
// secret sourced from the vault; NEVER committed. Fails loud if absent.
//
// Usage:
//   DOOR_FW_SIGNING_KEY=... node scripts/ota-build.mjs \
//     --role pico|pi-zero --version X.Y.Z [--min X.Y.Z] --src <dir> --out <dir> \
//     [--files main.py,wsclient.py] [--commit <sha>] [--built-at <iso>]
// Prints a JSON line: {blobPath, manifestPath, blobKey, sha256, size, version, role}

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { signManifest, validateManifest } from "../vps/lib/otaManifest.js";

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

function die(msg) {
  console.error("ota-build: " + msg);
  process.exit(1);
}

const role = arg("role");
const version = arg("version");
const minVersion = arg("min", "0.0.0");
const src = arg("src");
const out = arg("out", ".");
const commit = arg("commit", process.env.GITHUB_SHA || "");
const builtAt = arg("built-at", new Date().toISOString());

if (!["pico", "pi-zero"].includes(role)) die("--role must be pico|pi-zero");
if (!/^\d+\.\d+\.\d+$/.test(String(version))) die("--version must be semver x.y.z");
if (!src || !fs.existsSync(src)) die("--src dir not found: " + src);
if (!process.env.DOOR_FW_SIGNING_KEY) die("DOOR_FW_SIGNING_KEY is not set (vault→CI secret)");

fs.mkdirSync(out, { recursive: true });

// --- build the blob ---------------------------------------------------------------------------
let blob;
if (role === "pico") {
  // Slot files that OTA replaces (boot/ota/crypto stay at flash root — see firmware README).
  const files = arg("files", "main.py,wsclient.py").split(",").map((s) => s.trim()).filter(Boolean);
  const map = {};
  for (const name of files.sort()) {
    const p = path.join(src, name);
    if (!fs.existsSync(p)) die("missing file for pico bundle: " + name);
    map[name] = fs.readFileSync(p).toString("base64");
  }
  blob = Buffer.from(JSON.stringify({ files: map }), "utf8");
} else {
  // Deterministic tar.gz of the release .py files (reproducible: sorted, fixed mtime/owner).
  const names = fs.readdirSync(src)
    .filter((n) => n.endsWith(".py") && !n.includes("test") && n !== "__pycache__")
    .sort();
  if (!names.length) die("no .py files to package in " + src);
  const tarPath = path.join(out, `${role}-${version}.tgz`);
  execFileSync("tar", [
    "--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner",
    "-czf", tarPath, "-C", src, ...names,
  ]);
  blob = fs.readFileSync(tarPath);
}

const sha256 = crypto.createHash("sha256").update(blob).digest("hex");
const ext = role === "pico" ? "bin" : "tgz";
const blobKey = `firmware/${role}/${version}.${ext}`;

const manifest = { role, version, minVersion, sha256, size: blob.length, blobKey, builtAt, commit };
const errs = validateManifest(manifest);
if (errs.length) die("invalid manifest: " + errs.join("; "));

const signed = signManifest(manifest); // { manifest, sig, alg }

const blobPath = path.join(out, `${role}-${version}.${ext}`);
const manifestPath = path.join(out, `${role}-${version}.manifest.json`);
fs.writeFileSync(blobPath, blob);
fs.writeFileSync(manifestPath, JSON.stringify(signed));

console.log(JSON.stringify({ blobPath, manifestPath, blobKey, sha256, size: blob.length, version, role }));
