/**
 * Authentication and Session Management using Web Crypto HMAC-SHA256
 */

const DEFAULT_DEV_PASSWORD = "admin123456";
const DEFAULT_DEV_SECRET = "dev-secret-key-32-chars-long-minimum-random";
const COOKIE_NAME = "eo_imgbed_session";
const SESSION_TTL_SECONDS = 7 * 24 * 3600; // 7 days

function getAdminPassword(env = {}) {
  return (
    env.ADMIN_PASSWORD ||
    (typeof process !== "undefined" && process?.env?.ADMIN_PASSWORD) ||
    DEFAULT_DEV_PASSWORD
  );
}

function getSessionSecret(env = {}) {
  return (
    env.SESSION_SECRET ||
    (typeof process !== "undefined" && process?.env?.SESSION_SECRET) ||
    DEFAULT_DEV_SECRET
  );
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function signHMAC(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSessionToken(env = {}) {
  const secret = getSessionSecret(env);
  const payload = {
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);
  const signature = await signHMAC(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token, env = {}) {
  if (!token || typeof token !== "string") {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }
  const [encodedPayload, signature] = parts;
  const secret = getSessionSecret(env);
  const expectedSig = await signHMAC(secret, encodedPayload);
  if (!timingSafeEqual(signature, expectedSig)) {
    return false;
  }

  try {
    const payloadStr = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadStr);
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name?.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

/**
 * Dual verification:
 * 1. Authorization: Bearer <password_or_token> (PicGo, curl, or localStorage)
 * 2. Cookie: eo_imgbed_session=<signed_token>
 */
export async function verifyAuth(request, env = {}) {
  // 1. Check Authorization header
  const authHeader =
    request.headers.get("Authorization") ||
    request.headers.get("authorization") ||
    "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const adminPassword = getAdminPassword(env);
    // Raw admin password
    if (timingSafeEqual(token, adminPassword)) {
      return true;
    }
    // Signed session token from localStorage
    if (await verifySessionToken(token, env)) {
      return true;
    }
  }

  // 2. Check Cookie header
  const cookieHeader =
    request.headers.get("cookie") ||
    request.headers.get("Cookie") ||
    "";
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies[COOKIE_NAME];
  if (sessionToken) {
    return await verifySessionToken(sessionToken, env);
  }

  return false;
}

export function buildLoginCookie(token, isHttps = true) {
  const secureFlag = isHttps ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secureFlag}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; SameSite=Lax`;
}

export function buildLogoutCookie(isHttps = true) {
  const secureFlag = isHttps ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly${secureFlag}; Path=/; Max-Age=0; SameSite=Lax`;
}

function getApiTokens(env = {}) {
  const raw =
    env.API_TOKEN ||
    (typeof process !== "undefined" && process?.env?.API_TOKEN) ||
    "";
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractApiToken(request) {
  const authHeader =
    request.headers.get("Authorization") ||
    request.headers.get("authorization") ||
    "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const headerToken =
    request.headers.get("X-API-Token") ||
    request.headers.get("x-api-token") ||
    "";
  if (headerToken.trim()) return headerToken.trim();
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token") || "";
    if (queryToken.trim()) return queryToken.trim();
  } catch {
    // Ignore malformed URL.
  }
  return "";
}

export function verifyApiToken(request, env = {}) {
  const configured = getApiTokens(env);
  if (configured.length === 0) return false;
  const candidate = extractApiToken(request);
  if (!candidate) return false;
  return configured.some((valid) => timingSafeEqual(candidate, valid));
}

export async function verifyUploadOrReadAuth(request, env = {}) {
  if (await verifyAuth(request, env)) return true;
  return verifyApiToken(request, env);
}

export function verifyPassword(inputPassword, env = {}) {
  const adminPassword = getAdminPassword(env);
  return timingSafeEqual(inputPassword || "", adminPassword);
}
