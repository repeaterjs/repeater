import { describe, test, expect } from "@b9g/libuild/test";
import * as Sinon from "sinon";
import { Repeater } from "../index.js";
import {
  createDelay,
  createTimeout,
  createInterval,
  TimeoutError,
} from "../timers.js";

describe("timers", () => {
  test("createDelay sequential", async () => {
    const wait = 200;
    const timer = createDelay(wait);
    const result1 = await timer.next();
    const time1 = Date.now();
    const result2 = await timer.next();
    const time2 = Date.now();
    const result3 = await timer.next();
    const time3 = Date.now();
    const result4 = await timer.next();
    const time4 = Date.now();
    expect(result1.value).toBeCloseTo(time1, -1.5);
    expect(result1.done).toBe(false);
    expect(result2.value).toBeCloseTo(time2, -1.5);
    expect(result2.done).toBe(false);
    expect(result3.value).toBeCloseTo(time3, -1.5);
    expect(result3.done).toBe(false);
    expect(result4.value).toBeCloseTo(time4, -1.5);
    expect(result4.done).toBe(false);
    expect(result2.value - result1.value).toBeCloseTo(wait, -1.5);
    expect(result3.value - result2.value).toBeCloseTo(wait, -1.5);
    expect(result4.value - result3.value).toBeCloseTo(wait, -1.5);
    await timer.return();
  });

  test("createDelay concurrent", async () => {
    const wait = 200;
    const timer = createDelay(wait);
    const result1 = timer.next();
    const result2 = timer.next();
    const result3 = timer.next();
    const result4 = timer.next();
    const start = Date.now();
    const results = await Promise.all([result1, result2, result3, result4]);
    const end = Date.now();
    expect(end - start).toBeCloseTo(wait, -1.5);
    for (const result of results) {
      expect(result.value).toBeCloseTo(end, -1.5);
      expect(result.done).toBe(false);
    }
    await timer.return();
  });

  test("createDelay cancels", async () => {
    const slow = createDelay(100);
    const fast = createDelay(50);
    const s = slow.next();
    const f = fast.next();
    const result = await Promise.race([s, f]);
    expect(result.done).toEqual(false);
    slow.return();
    await expect(s).resolves.toEqual({ done: true });
    await expect(f).resolves.toBe(result);
    fast.return();
    await expect(fast.next()).resolves.toEqual({ done: true });
  });

  test("createDelay does not call timer functions unnecessarily", async () => {
    const setTimeoutSpy = Sinon.spy(globalThis, "setTimeout");
    const clearTimeoutSpy = Sinon.spy(globalThis, "clearTimeout");
    try {
      const timer = createDelay(0);
      await expect(timer.return()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
      expect(setTimeoutSpy.callCount).toBe(0);
      expect(clearTimeoutSpy.callCount).toBe(0);
    } finally {
      setTimeoutSpy.restore();
      clearTimeoutSpy.restore();
    }
  });

  test("createTimeout rejects", async () => {
    const timer = createTimeout(50);
    await expect(timer.next()).rejects.toBeInstanceOf(TimeoutError);
    await expect(timer.next()).resolves.toEqual({ done: true });
  });

  test("createTimeout resolves when next is called before timeout rejects", async () => {
    const slow = createTimeout(100);
    const fast = createDelay(50);
    const s1 = slow.next();
    await fast.next();
    const s2 = slow.next();
    await fast.next();
    const s3 = slow.next();
    await expect(s1).resolves.toEqual({ done: false });
    await expect(s2).resolves.toEqual({ done: false });
    await expect(s3).rejects.toBeInstanceOf(TimeoutError);
    await expect(slow.next()).resolves.toEqual({ done: true });
    await fast.return();
  });

  test("createTimeout does not call timer functions unnecessarily", async () => {
    const setTimeoutSpy = Sinon.spy(globalThis, "setTimeout");
    const clearTimeoutSpy = Sinon.spy(globalThis, "clearTimeout");
    try {
      const timer = createTimeout(0);
      await expect(timer.return()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
      expect(setTimeoutSpy.callCount).toBe(0);
      expect(clearTimeoutSpy.callCount).toBe(0);
    } finally {
      setTimeoutSpy.restore();
      clearTimeoutSpy.restore();
    }
  });

  test("racing fast createDelay with slow createTimeout", async () => {
    let i = 0;
    const slow = createTimeout(100);
    const fast = createDelay(50);
    for await (const t of Repeater.race([slow, fast])) {
      expect(t).toBeCloseTo(Date.now(), -1.5);
      i++;
      if (i > 20) {
        break;
      }
    }

    expect(i).toBe(21);
    await expect(slow.next()).resolves.toEqual({ done: true });
    await expect(fast.next()).resolves.toEqual({ done: true });
  });

  test("racing slow createDelay with fast createTimeout", async () => {
    const slow = createDelay(100);
    const fast = createTimeout(50);
    const race = Repeater.race([slow, fast]);
    await expect(race.next()).rejects.toBeInstanceOf(TimeoutError);
    await expect(slow.next()).resolves.toEqual({ done: true });
    await expect(fast.next()).resolves.toEqual({ done: true });
  });

  test("createInterval ticks", async () => {
    const timer = createInterval(10);
    let result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    timer.return();
    result = await timer.next();
    expect(result).toEqual({ done: true });
  });

  test("createInterval calls clearInterval", async () => {
    const clearIntervalSpy = Sinon.spy(globalThis, "clearInterval");
    try {
      const timer = createInterval(10);
      const result = await timer.next();
      expect(result.value).toBeLessThanOrEqual(Date.now());
      expect(result.done).toBe(false);
      await timer.return();
      expect(clearIntervalSpy.callCount).toBe(1);
    } finally {
      clearIntervalSpy.restore();
    }
  });

  test("createInterval does not call timer functions unnecessarily", async () => {
    const setIntervalSpy = Sinon.spy(globalThis, "setInterval");
    const clearIntervalSpy = Sinon.spy(globalThis, "clearInterval");
    try {
      const timer = createInterval(50);
      await expect(timer.return()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
      expect(setIntervalSpy.callCount).toBe(0);
      expect(clearIntervalSpy.callCount).toBe(0);
    } finally {
      setIntervalSpy.restore();
      clearIntervalSpy.restore();
    }
  });
});
