import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./breaker";

describe("CircuitBreaker", () => {
  it("stays closed below the failure threshold and resets on success", () => {
    const b = new CircuitBreaker({ failureThreshold: 3 });
    b.recordFailure("p");
    b.recordFailure("p");
    expect(b.allows("p")).toBe(true);
    b.recordSuccess("p");
    b.recordFailure("p");
    b.recordFailure("p");
    expect(b.allows("p")).toBe(true);
  });

  it("opens after consecutive failures and closes again after the cooldown", () => {
    let t = 0;
    const b = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => t });
    b.recordFailure("p");
    b.recordFailure("p");
    expect(b.allows("p")).toBe(false);
    expect(b.allows("q")).toBe(true);

    t = 999;
    expect(b.allows("p")).toBe(false);
    t = 1000;
    expect(b.allows("p")).toBe(true); // half-open trial
    b.recordFailure("p");
    expect(b.allows("p")).toBe(false); // re-opened immediately

    t = 2000;
    expect(b.allows("p")).toBe(true);
    b.recordSuccess("p");
    b.recordFailure("p");
    expect(b.allows("p")).toBe(true); // fully closed again, counting from zero
  });

  it("reports a snapshot", () => {
    const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: () => 0 });
    b.recordFailure("p");
    expect(b.snapshot()).toEqual({ p: { failures: 1, open: true } });
  });
});
