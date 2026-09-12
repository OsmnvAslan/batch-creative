import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp } from "./ratelimit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then rejects with a retry hint", () => {
    let t = 0;
    const rl = new RateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });
    expect(rl.check("a")).toEqual({ allowed: true, remaining: 0, retryAfterMs: 0 });
    t = 400;
    expect(rl.check("a")).toEqual({ allowed: false, remaining: 0, retryAfterMs: 600 });
    expect(rl.check("b").allowed).toBe(true);
    t = 1000;
    expect(rl.check("a").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientIp(req)).toBe("1.2.3.4");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});
