import assert from "node:assert/strict";
import test from "node:test";
import {
  isLoginBlocked,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  loginKey,
  recordLoginFailure,
  resetLoginFailures,
  trackedLoginKeys,
} from "./login-throttle";

const T0 = 1_000_000;

test("the key is the normalised email", () => {
  assert.equal(loginKey("  Owner@Example.com "), "owner@example.com");
});

test("N failures block the account, even if the next password would be right", () => {
  const k = loginKey("a@example.com");
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) recordLoginFailure(k, T0);
  assert.equal(isLoginBlocked(k, T0), false);
  recordLoginFailure(k, T0);
  assert.equal(isLoginBlocked(k, T0 + 1000), true);
});

test("accounts are independent", () => {
  const a = loginKey("blocked@example.com");
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) recordLoginFailure(a, T0);
  assert.equal(isLoginBlocked(a, T0), true);
  assert.equal(isLoginBlocked(loginKey("other@example.com"), T0), false);
});

test("a successful login resets the counter", () => {
  const k = loginKey("b@example.com");
  for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) recordLoginFailure(k, T0);
  resetLoginFailures(k);
  recordLoginFailure(k, T0);
  assert.equal(isLoginBlocked(k, T0), false);
});

test("the block expires with the window", () => {
  const k = loginKey("c@example.com");
  for (let i = 0; i < LOGIN_MAX_FAILURES; i++) recordLoginFailure(k, T0);
  assert.equal(isLoginBlocked(k, T0 + LOGIN_WINDOW_MS + 1), false);
});

test("the map stays bounded", () => {
  for (let i = 0; i < 12_000; i++) recordLoginFailure(`bulk${i}@example.com`, T0);
  assert.ok(trackedLoginKeys() <= 10_000);
});
