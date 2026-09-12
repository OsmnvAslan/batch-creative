import { describe, expect, it, vi } from "vitest";
import { ProviderError, isRetryable, withBackoff } from "./retry";

const noSleep = () => Promise.resolve();

describe("ProviderError", () => {
  it("derives retryability from the HTTP status", () => {
    expect(new ProviderError("x", { status: 500 }).retryable).toBe(true);
    expect(new ProviderError("x", { status: 429 }).retryable).toBe(true);
    expect(new ProviderError("x", { status: 408 }).retryable).toBe(true);
    expect(new ProviderError("x", { status: 400 }).retryable).toBe(false);
    expect(new ProviderError("x", { status: 401 }).retryable).toBe(false);
    expect(new ProviderError("x", { status: 404 }).retryable).toBe(false);
  });

  it("lets an explicit flag override the status", () => {
    expect(new ProviderError("x", { status: 400, retryable: true }).retryable).toBe(true);
    expect(new ProviderError("x", { retryable: false }).retryable).toBe(false);
  });

  it("treats unknown errors and timeouts as transient", () => {
    expect(isRetryable(new Error("boom"))).toBe(true);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isRetryable(abort)).toBe(true);
    expect(isRetryable("string")).toBe(true);
  });
});

describe("withBackoff", () => {
  it("returns on first success without sleeping", async () => {
    const sleep = vi.fn(noSleep);
    const onAttempt = vi.fn();
    const result = await withBackoff(async () => "ok", { retries: 2, baseMs: 100, sleep, onAttempt });
    expect(result).toBe("ok");
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient failures with exponential backoff + jitter", async () => {
    const sleep = vi.fn((_ms: number) => noSleep());
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new ProviderError("HTTP 503", { status: 503 });
      return "ok";
    };
    const result = await withBackoff(fn, { retries: 2, baseMs: 100, sleep, random: () => 0.5 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([150, 250]); // 100+50, 200+50
  });

  it("gives up after retries are exhausted and rethrows the last error", async () => {
    const onAttempt = vi.fn();
    const fn = vi.fn(async () => {
      throw new ProviderError("HTTP 502", { status: 502 });
    });
    await expect(
      withBackoff(fn, { retries: 2, baseMs: 1, sleep: noSleep, onAttempt }),
    ).rejects.toThrow("HTTP 502");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onAttempt).toHaveBeenCalledTimes(3);
  });

  it("fails fast on a non-retryable error", async () => {
    const sleep = vi.fn(noSleep);
    const fn = vi.fn(async () => {
      throw new ProviderError("HTTP 401", { status: 401 });
    });
    await expect(withBackoff(fn, { retries: 5, baseMs: 1, sleep })).rejects.toThrow("HTTP 401");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
