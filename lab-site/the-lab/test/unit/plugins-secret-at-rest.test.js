// Encryption-at-rest for addon `type:"secret"` config values (issue #196, CWE-311).
//
// Regression: before this fix, service.setConfig persisted a plaintext secret
// straight into the `plugins` collection. These tests pin the invariants:
//   - a stored secret is AES-256-GCM ciphertext (never the plaintext),
//   - it round-trips to plaintext ONLY server-side (registry point of use),
//   - it NEVER serializes onto a response (write-only-to-client), and
//   - a blank/omitted secret in a patch leaves the stored ciphertext unchanged.

// --- Mocks for the service write-path test (keep the real crypto + schema) ---
jest.mock("@/lib/audit", () => ({ __esModule: true, auditLog: jest.fn() }));
jest.mock("@/app/api/v1/users/access", () => ({ __esModule: true, isAdmin: jest.fn(() => true) }));
jest.mock("@/lib/plugins/model", () => ({
  __esModule: true,
  default: { getState: jest.fn(), setConfig: jest.fn(), setEnabled: jest.fn(), listStates: jest.fn() },
}));
jest.mock("@/lib/plugins/registry", () => ({
  __esModule: true,
  getPlugin: jest.fn(),
  applyConfig: jest.fn(),
  ensurePluginsInit: jest.fn(),
  listPlugins: jest.fn(() => []),
}));

import {
  encryptSecret, decryptSecret, isEncrypted, encryptSecretConfig, decryptSecretConfig, ENVELOPE_PREFIX,
} from "@/lib/plugins/secretCrypto";
import { validateConfig } from "@/lib/plugins/manifest.schema";
import { setConfig } from "@/lib/plugins/service";
import PluginStateModel from "@/lib/plugins/model";
import * as registry from "@/lib/plugins/registry";

const ADMIN = { userID: "admin-1", role: "admin" };
const SCHEMA = { apiKey: { type: "secret" }, label: { type: "string" } };
const PLAINTEXT = "demo-integration-value-abc123"; // stand-in for an addon secret

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;
beforeAll(() => { process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; }); // exactly 32 bytes
afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("secretCrypto — AES-256-GCM at rest", () => {
  test("encryptSecret yields a self-describing envelope, not the plaintext", () => {
    const env = encryptSecret(PLAINTEXT);
    expect(env).not.toBe(PLAINTEXT);
    expect(env).not.toContain(PLAINTEXT);
    expect(env.startsWith("enc:v1:gcm:")).toBe(true);
    expect(isEncrypted(env)).toBe(true);
    expect(isEncrypted(PLAINTEXT)).toBe(false);
  });

  test("round-trips to the original plaintext", () => {
    expect(decryptSecret(encryptSecret(PLAINTEXT))).toBe(PLAINTEXT);
  });

  test("uses a random IV — same plaintext encrypts to different ciphertext", () => {
    expect(encryptSecret(PLAINTEXT)).not.toBe(encryptSecret(PLAINTEXT));
  });

  test("authenticated: a tampered ciphertext fails closed (throws)", () => {
    const env = encryptSecret(PLAINTEXT);
    // flip the last base64 char of the ciphertext segment
    const parts = env.slice("enc:v1:gcm:".length).split(":");
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith("A") ? "B" : "A");
    const tampered = "enc:v1:gcm:" + parts.join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  test("fails closed when the key is unset (no || '' fallback)", () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    try {
      expect(() => encryptSecret(PLAINTEXT)).toThrow(/ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = saved;
    }
  });

  test("encryptSecretConfig only encrypts secret fields; is idempotent on envelopes", () => {
    const enc = encryptSecretConfig(SCHEMA, { apiKey: PLAINTEXT, label: "Hello" });
    expect(isEncrypted(enc.apiKey)).toBe(true);
    expect(enc.label).toBe("Hello"); // non-secret passes through verbatim
    // Re-running leaves an already-encrypted secret byte-for-byte unchanged.
    const again = encryptSecretConfig(SCHEMA, enc);
    expect(again.apiKey).toBe(enc.apiKey);
  });

  test("decryptSecretConfig round-trips secrets and leaves plain values alone", () => {
    const enc = encryptSecretConfig(SCHEMA, { apiKey: PLAINTEXT, label: "Hello" });
    const dec = decryptSecretConfig(enc);
    expect(dec.apiKey).toBe(PLAINTEXT);
    expect(dec.label).toBe("Hello");
  });

  test("validateConfig rejects an inbound secret starting with the envelope prefix", () => {
    const crafted = ENVELOPE_PREFIX + "abc";
    const res = validateConfig(SCHEMA, { apiKey: crafted }, {});
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toContain(ENVELOPE_PREFIX);
    expect(res.value).not.toHaveProperty("apiKey"); // not carried through as plaintext
  });

  test("blank-patch keeps a stored envelope (guard only applies to inbound patch values)", () => {
    const stored = encryptSecret(PLAINTEXT); // an envelope living in `current` (from storage)
    const res = validateConfig(SCHEMA, { apiKey: "" }, { apiKey: stored, label: "Hello" });
    expect(res.ok).toBe(true);
    expect(res.value.apiKey).toBe(stored); // unchanged, never rejected
  });
});

describe("service.setConfig — write-only + at-rest (issue #196)", () => {
  const entry = { manifest: { id: "demo", configSchema: SCHEMA } };

  beforeEach(() => {
    jest.clearAllMocks();
    registry.getPlugin.mockReturnValue(entry);
    registry.applyConfig.mockResolvedValue(undefined);
    PluginStateModel.setConfig.mockResolvedValue(undefined);
  });

  test("persists the secret as ciphertext, never plaintext; response is redacted", async () => {
    PluginStateModel.getState.mockResolvedValue(null); // first-time config
    const res = await setConfig("demo", { apiKey: PLAINTEXT, label: "Hello" }, ADMIN);

    // What was written to Mongo:
    const [, stored] = PluginStateModel.setConfig.mock.calls[0];
    expect(stored.apiKey).not.toBe(PLAINTEXT);
    expect(isEncrypted(stored.apiKey)).toBe(true);
    expect(stored.label).toBe("Hello");
    // Server-side round-trip proves the value is recoverable at point of use:
    expect(decryptSecret(stored.apiKey)).toBe(PLAINTEXT);

    // The response NEVER carries the value or its ciphertext (write-only-to-client):
    expect(res.config).not.toHaveProperty("apiKey");
    expect(res.secretsSet).toEqual({ apiKey: true });
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(PLAINTEXT);
    expect(serialized).not.toContain("enc:v1:gcm:");
  });

  test("blank/omitted secret in a patch leaves the stored ciphertext unchanged", async () => {
    const priorCiphertext = encryptSecret(PLAINTEXT);
    PluginStateModel.getState.mockResolvedValue({ config: { apiKey: priorCiphertext, label: "Hello" } });

    const res = await setConfig("demo", { apiKey: "", label: "World" }, ADMIN);
    const [, stored] = PluginStateModel.setConfig.mock.calls[0];

    // Byte-for-byte unchanged — never cleared, never re-encrypted, never re-exposed.
    expect(stored.apiKey).toBe(priorCiphertext);
    expect(decryptSecret(stored.apiKey)).toBe(PLAINTEXT);
    expect(stored.label).toBe("World"); // the non-secret patch still applies
    expect(res.secretsSet).toEqual({ apiKey: true });
    expect(JSON.stringify(res)).not.toContain("enc:v1:gcm:");
  });

  test("rejects an inbound secret that looks like our ciphertext envelope (fail closed, not stored plaintext)", async () => {
    PluginStateModel.getState.mockResolvedValue(null);
    const crafted = ENVELOPE_PREFIX + "not-really-encrypted";
    await expect(setConfig("demo", { apiKey: crafted }, ADMIN)).rejects.toThrow(/Invalid config/);
    // Nothing was persisted — the guard fires before the DB write.
    expect(PluginStateModel.setConfig).not.toHaveBeenCalled();
  });

  test("replacing the secret with a new value re-encrypts it (still ciphertext)", async () => {
    const priorCiphertext = encryptSecret(PLAINTEXT);
    PluginStateModel.getState.mockResolvedValue({ config: { apiKey: priorCiphertext } });

    await setConfig("demo", { apiKey: "demo-replacement-value-xyz789" }, ADMIN);
    const [, stored] = PluginStateModel.setConfig.mock.calls[0];
    expect(isEncrypted(stored.apiKey)).toBe(true);
    expect(stored.apiKey).not.toBe(priorCiphertext);
    expect(decryptSecret(stored.apiKey)).toBe("demo-replacement-value-xyz789");
  });
});
