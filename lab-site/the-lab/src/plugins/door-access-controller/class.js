// Document shapers for the door-access addon's persisted records. Pure factories —
// no DB access (that's model.js). Keeps the stored shape in one reviewable place.

/**
 * A paired access credential. The raw code is NEVER stored — only its GCM ciphertext
 * (`codeEnc`) and a keyed blind index (`bi`) for lookup. See cardCrypto.js.
 * @param {{ userID:string, codeEnc:string, bi:string, credentialType?:("nfc"|"qr") }} p
 */
export function newCardDoc({ userID, codeEnc, bi, credentialType = "nfc" }) {
  const now = new Date().toISOString();
  return { userID, codeEnc, bi, credentialType, status: "active", createdAt: now, updatedAt: now };
}

/**
 * A physical door / reader.
 * @param {{ doorId:string, name?:string, deviceId:string, timezone?:(string|null) }} p
 */
export function newDoorDoc({ doorId, name = doorId, deviceId, timezone = null }) {
  const now = new Date().toISOString();
  return { doorId, name, deviceId, timezone, enabled: true, createdAt: now, updatedAt: now };
}

/** Empty access policy (rules + per-account overrides). Merged with the manifest's flat knobs. */
export const EMPTY_POLICY = { rules: [], accountOverrides: {} };
