#!/usr/bin/env node
// Derive a per-recipient index key (edgeIndexKey / brokerIndexKey) EXACTLY as the cloud does, by
// REUSING the plugin's recipientIndexKey — so the provisioned key byte-matches how buildDoorEnvelope
// re-keys that recipient's envelopes (no re-implementation = no cross-language HKDF drift; §2 F1/F3).
// The master DOOR_CARD_INDEX_KEY is read from the ENV (never argv — it'd leak via ps/history).
//   usage: DOOR_CARD_INDEX_KEY=… node derive-index-key.mjs <recipientId>   →  base64(32B) on stdout
import { recipientIndexKey } from "../../src/plugins/door-access-controller/cardCrypto.js";

const recipientId = process.argv[2];
if (!recipientId) {
  process.stderr.write("usage: derive-index-key.mjs <recipientId> (DOOR_CARD_INDEX_KEY in env)\n");
  process.exit(2);
}
try {
  // recipientIndexKey throws if DOOR_CARD_INDEX_KEY is unset (fail-closed) — good.
  process.stdout.write(recipientIndexKey(recipientId).toString("base64") + "\n");
} catch (e) {
  process.stderr.write(`derive-index-key: ${(e && e.message) || e}\n`);
  process.exit(1);
}
