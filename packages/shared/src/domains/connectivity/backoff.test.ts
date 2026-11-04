import { describe, expect, it } from "vitest";
import { backoffDelay, nextBackoff, resetBackoff, BACKOFF_MAX_MS } from "./backoff.js";

describe("backoff with full jitter (RF-10)", () => {
  it("grows exponentially and caps at 30s", () => {
    expect(backoffDelay(0, () => 1)).toBe(1000);
    expect(backoffDelay(1, () => 1)).toBe(2000);
    expect(backoffDelay(10, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(0, () => 0)).toBe(0);
  });

  it("advances the attempt and resets on event", () => {
    const s = { attempt: 0 };
    nextBackoff(s, () => 1);
    expect(s.attempt).toBe(1);
    resetBackoff(s);
    expect(s.attempt).toBe(0);
  });
});
