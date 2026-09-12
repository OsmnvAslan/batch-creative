import { describe, expect, it } from "vitest";
import { Semaphore, SemaphoreRegistry } from "./semaphore";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("Semaphore", () => {
  it("caps concurrent runs and releases in FIFO order", async () => {
    const s = new Semaphore(2);
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        s.run(async () => {
          peak = Math.max(peak, s.inFlight);
          order.push(i);
          await tick();
          await tick();
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5]);
    expect(s.inFlight).toBe(0);
  });

  it("releases the slot when the task throws", async () => {
    const s = new Semaphore(1);
    await expect(
      s.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(s.inFlight).toBe(0);
    await expect(s.run(async () => "ok")).resolves.toBe("ok");
  });

  it("rejects a non-positive limit", () => {
    expect(() => new Semaphore(0)).toThrow();
  });
});

describe("SemaphoreRegistry", () => {
  it("reuses one semaphore per name and rebuilds when the limit changes", () => {
    const r = new SemaphoreRegistry();
    const a = r.for("p", 1);
    expect(r.for("p", 1)).toBe(a);
    expect(r.for("p", 2)).not.toBe(a);
    expect(r.for("q", 1)).not.toBe(a);
  });
});
