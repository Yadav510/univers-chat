/**
 * End-to-end encryption (E2EE) using the Web Crypto API.
 *
 * - Each user has an ECDH P-256 keypair.
 * - Private key lives ONLY in this browser (localStorage as a JWK).
 * - Public key is uploaded to the user's profile so peers can fetch it.
 * - For a 1:1 chat, we ECDH-derive a 256-bit AES-GCM key from
 *   (myPrivate × theirPublic) on send and (myPrivate × theirPublic) on read.
 *   Both sides produce the SAME key — that's the magic of ECDH.
 * - Each message is encrypted with a fresh random 12-byte IV (the "nonce")
 *   and stored as base64 ciphertext + base64 nonce.  The plaintext NEVER
 *   touches the server.
 */

const PRIV_KEY_STORAGE = "univers.e2ee.priv.v1";

/* ----------------------------- base64 helpers ----------------------------- */

export function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* --------------------------- keypair management --------------------------- */

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return b64encode(spki);
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const spki = b64decode(b64);
  return await crypto.subtle.importKey(
    "spki",
    spki.buffer.slice(spki.byteOffset, spki.byteOffset + spki.byteLength) as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

async function exportPrivateJwk(key: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey("jwk", key);
}

async function importPrivateJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );
}

/** Load this device's private key, or null if none exists yet. */
export async function loadPrivateKey(): Promise<CryptoKey | null> {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PRIV_KEY_STORAGE);
  if (!raw) return null;
  try {
    const jwk = JSON.parse(raw) as JsonWebKey;
    return await importPrivateJwk(jwk);
  } catch {
    return null;
  }
}

export async function savePrivateKey(key: CryptoKey): Promise<void> {
  const jwk = await exportPrivateJwk(key);
  localStorage.setItem(PRIV_KEY_STORAGE, JSON.stringify(jwk));
}

/* --------------------------- shared key + AES ---------------------------- */

/** Derive an AES-GCM key shared between (myPriv, theirPub). */
export async function deriveSharedKey(
  myPriv: CryptoKey,
  theirPub: CryptoKey,
): Promise<CryptoKey> {
  return await crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPub },
    myPriv,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptText(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: b64encode(ct), nonce: b64encode(iv) };
}

export async function decryptText(
  key: CryptoKey,
  ciphertext: string,
  nonce: string,
): Promise<string> {
  const ivBytes = b64decode(nonce);
  const ctBytes = b64decode(ciphertext);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(ivBytes) },
    key,
    toBuf(ctBytes),
  );
  return new TextDecoder().decode(pt);
}

function toBuf(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

/* --------------------------- file encryption ----------------------------- */

export async function generateFileKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(
  key: CryptoKey,
  bytes: ArrayBuffer,
): Promise<{ ciphertext: ArrayBuffer; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv) },
    key,
    bytes,
  );
  return { ciphertext: ct, nonce: b64encode(iv) };
}

export async function decryptBytes(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  nonce: string,
): Promise<ArrayBuffer> {
  const iv = b64decode(nonce);
  return await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(iv) },
    key,
    ciphertext,
  );
}

export async function wrapFileKey(
  sharedKey: CryptoKey,
  fileKey: CryptoKey,
): Promise<{ ciphertext: string; nonce: string }> {
  const raw = await crypto.subtle.exportKey("raw", fileKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuf(iv) },
    sharedKey,
    raw,
  );
  return { ciphertext: b64encode(ct), nonce: b64encode(iv) };
}

export async function unwrapFileKey(
  sharedKey: CryptoKey,
  ciphertext: string,
  nonce: string,
): Promise<CryptoKey> {
  const iv = b64decode(nonce);
  const ct = b64decode(ciphertext);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(iv) },
    sharedKey,
    toBuf(ct),
  );
  return await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}
