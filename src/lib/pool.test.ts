import { describe, expect, it } from "vitest";
import { runPool } from "./pool";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("runPool", () => {
  it("processes every item exactly once, in order of dispatch", async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await runPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      await tick();
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it("clamps a bad limit to at least one worker", async () => {
    const seen: number[] = [];
    await runPool([1, 2], 0, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([1, 2]);
  });

  it("keeps draining other workers when one worker rejects", async () => {
    const seen: number[] = [];
    await expect(
      runPool([1, 2, 3, 4], 2, async (item) => {
        await tick();
        if (item === 1) throw new Error("boom");
        seen.push(item);
      }),
    ).rejects.toThrow("boom");
    // Worker 2 keeps going through the remaining items.
    await tick();
    await tick();
    expect(seen).toContain(2);
  });

  it("resolves immediately for an empty list", async () => {
    await expect(runPool([], 3, async () => {})).resolves.toBeUndefined();
  });
});
