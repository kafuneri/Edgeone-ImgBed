import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  verifySessionToken,
  verifyPassword,
  verifyAuth,
  verifyApiToken,
  verifyUploadOrReadAuth,
} from "../edge-functions/_utils/auth.js";

const TEST_ENV = {
  ADMIN_PASSWORD: "testPassword123!",
  SESSION_SECRET: "test-secret-key-at-least-32-characters-long-12345",
  API_TOKEN: "tok_blog_abc123, tok_mobile_xyz789",
};

test("verifyPassword should match valid and reject invalid", () => {
  assert.equal(verifyPassword("testPassword123!", TEST_ENV), true);
  assert.equal(verifyPassword("wrongPassword", TEST_ENV), false);
  assert.equal(verifyPassword("", TEST_ENV), false);
});

test("createSessionToken and verifySessionToken should sign and verify correctly", async () => {
  const token = await createSessionToken(TEST_ENV);
  assert.ok(token);
  assert.equal(token.split(".").length, 2);

  const isValid = await verifySessionToken(token, TEST_ENV);
  assert.equal(isValid, true);
});

test("verifySessionToken should reject tampered token", async () => {
  const token = await createSessionToken(TEST_ENV);
  const [payload, sig] = token.split(".");
  // Tamper with payload
  const tamperedToken = `${payload}x.${sig}`;
  const isValid = await verifySessionToken(tamperedToken, TEST_ENV);
  assert.equal(isValid, false);
});

test("verifySessionToken should reject token with different secret", async () => {
  const token = await createSessionToken(TEST_ENV);
  const otherEnv = {
    SESSION_SECRET: "another-different-secret-key-32-chars-long-123456",
  };
  const isValid = await verifySessionToken(token, otherEnv);
  assert.equal(isValid, false);
});

test("API_TOKEN supports Bearer, X-API-Token, and query token for upload/read only", async () => {
  const bearerReq = new Request("https://img.example.com/api/upload", {
    headers: { Authorization: "Bearer tok_blog_abc123" },
  });
  assert.equal(verifyApiToken(bearerReq, TEST_ENV), true);
  assert.equal(await verifyUploadOrReadAuth(bearerReq, TEST_ENV), true);
  // Scoped API_TOKEN must NOT pass admin-only verifyAuth
  assert.equal(await verifyAuth(bearerReq, TEST_ENV), false);

  const headerReq = new Request("https://img.example.com/api/files", {
    headers: { "X-API-Token": "tok_mobile_xyz789" },
  });
  assert.equal(verifyApiToken(headerReq, TEST_ENV), true);
  assert.equal(await verifyUploadOrReadAuth(headerReq, TEST_ENV), true);

  const queryReq = new Request("https://img.example.com/api/upload?token=tok_blog_abc123");
  assert.equal(verifyApiToken(queryReq, TEST_ENV), true);
  assert.equal(await verifyUploadOrReadAuth(queryReq, TEST_ENV), true);

  const badReq = new Request("https://img.example.com/api/upload", {
    headers: { Authorization: "Bearer wrong_token" },
  });
  assert.equal(verifyApiToken(badReq, TEST_ENV), false);
  assert.equal(await verifyUploadOrReadAuth(badReq, TEST_ENV), false);
});
