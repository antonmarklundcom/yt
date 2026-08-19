import assert from "node:assert/strict";
import { test } from "node:test";
import { batchFailureReason, mapProviderStatus } from "./batch";

/**
 * The regression these guard: `entry.result.error` is an ErrorResponse envelope
 * whose own `type` is the constant "error". Reading it recorded the literal
 * word "error" for every failure, so a billing failure and a malformed request
 * were indistinguishable in the analyses table.
 */

function errored(type: string, message: string) {
  return {
    type: "errored" as const,
    error: {
      type: "error" as const,
      request_id: "req_123",
      error: { type, message },
    },
  };
}

test("errored: reports the inner error type, not the 'error' envelope", () => {
  const reason = batchFailureReason(errored("invalid_request_error", "max_tokens too large") as never);
  assert.equal(reason, "batch error: invalid_request_error: max_tokens too large");
  assert.ok(!reason.includes("batch error: error"));
});

test("errored: distinguishes failures that used to collapse into one string", () => {
  const billing = batchFailureReason(errored("billing_error", "credit balance too low") as never);
  const rate = batchFailureReason(errored("rate_limit_error", "slow down") as never);
  assert.notEqual(billing, rate);
  assert.ok(billing.includes("billing_error"));
  assert.ok(rate.includes("rate_limit_error"));
});

test("errored: falls back to the type alone when the message is empty", () => {
  assert.equal(batchFailureReason(errored("api_error", "   ") as never), "batch error: api_error");
});

test("errored: survives an error object missing its inner detail", () => {
  const reason = batchFailureReason({
    type: "errored",
    error: { type: "error", request_id: null },
  } as never);
  assert.equal(reason, "batch error: unknown_error");
});

test("non-errored results keep their own outcome word", () => {
  assert.equal(batchFailureReason({ type: "expired" } as never), "batch expired");
  assert.equal(batchFailureReason({ type: "canceled" } as never), "batch canceled");
});

test("only 'ended' is collectable; canceling stays open so paid results are not dropped", () => {
  assert.equal(mapProviderStatus("ended"), "ended");
  assert.equal(mapProviderStatus("in_progress"), "in_progress");
  assert.equal(mapProviderStatus("canceling"), "in_progress");
});
