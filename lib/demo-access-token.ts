export const DEMO_ACCESS_COOKIE = "omnis_demo_access";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function createDemoAccessToken(secret: string) {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  const signature = await signPayload(payload, secret);

  return `${payload}.${signature}`;
}

export async function verifyDemoAccessToken(token: string | undefined, secret: string | undefined) {
  const configuredSecret = secret?.trim();

  if (!token || !configuredSecret) {
    return false;
  }

  const [version, expiresAtRaw, signature] = token.split(".");

  if (version !== TOKEN_VERSION || !expiresAtRaw || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const expectedSignature = await signPayload(`${version}.${expiresAtRaw}`, configuredSecret);

  return constantTimeEqual(signature, expectedSignature);
}

async function signPayload(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const secretBytes = toArrayBuffer(encoder.encode(secret));
  const payloadBytes = toArrayBuffer(encoder.encode(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);

  return base64UrlEncode(new Uint8Array(signature));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
