import { Channel } from "@channel/channel";
import { delay, interval, timeout, TimeoutError } from "../index";

describe("timers", () => {
  test("delay sequential", async () => {
    const wait = 500;
    const timer = delay(wait);
    const result1 = await timer.next();
    const time1 = Date.now();
    const result2 = await timer.next();
    const time2 = Date.now();
    const result3 = await timer.next();
    const time3 = Date.now();
    const result4 = await timer.next();
    const time4 = Date.now();
    expect(result1.value).toBeCloseTo(time1, -1);
    expect(result1.done).toBe(false);
    expect(result2.value).toBeCloseTo(time2, -1);
    expect(result2.done).toBe(false);
    expect(result3.value).toBeCloseTo(time3, -1);
    expect(result3.done).toBe(false);
    expect(result4.value).toBeCloseTo(time4, -1);
    expect(result4.done).toBe(false);
    expect(result2.value - result1.value).toBeCloseTo(wait, -1.2);
    expect(result3.value - result2.value).toBeCloseTo(wait, -1.2);
    expect(result4.value - result3.value).toBeCloseTo(wait, -1.2);
  });

  test("delay concurrent", async () => {
    const wait = 1000;
    const timer = delay(wait);
    const result1 = timer.next();
    const result2 = timer.next();
    const result3 = timer.next();
    const result4 = timer.next();
    const start = Date.now();
    const results = await Promise.all([result1, result2, result3, result4]);
    const end = Date.now();
    expect(end - start).toBeCloseTo(wait, -1.2);
    for (const result of results) {
      expect(result.value).toBeCloseTo(end, -1.2);
      expect(result.done).toBe(false);
    }
  });

  test("delay cancels", async () => {
    const slow = delay(100);
    const fast = delay(50);
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

  test("delay does not call timer functions unnecessarily", async () => {
    try {
      jest.useFakeTimers();
      const timer = delay(0);
      await expect(timer.return()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
      expect(setTimeout).toHaveBeenCalledTimes(0);
      expect(clearTimeout).toHaveBeenCalledTimes(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("timeout rejects", async () => {
    const timer = timeout(100);
    await expect(timer.next()).rejects.toBeInstanceOf(TimeoutError);
    await expect(timer.next()).resolves.toEqual({ done: true });
  });

  test("timeout resolves when next is called before timeout rejects", async () => {
    const slow = timeout(100);
    const fast = delay(50);
    const s1 = slow.next();
    const f1 = await fast.next();
    const s2 = slow.next();
    const f2 = await fast.next();
    const s3 = slow.next();
    expect((await s1).done).toBe(false);
    expect((await s1).value).toBeCloseTo(f1.value, -1);
    expect((await s2).done).toBe(false);
    expect((await s2).value).toBeCloseTo(f2.value, -1);
    await expect(s3).rejects.toBeInstanceOf(TimeoutError);
    await expect(slow.next()).resolves.toEqual({ done: true });
  });

  test("timeout does not call timer functions unnecessarily", async () => {
    try {
      jest.useFakeTimers();
      const timer = timeout(0);
      await expect(timer.return()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
      expect(setTimeout).toHaveBeenCalledTimes(0);
      expect(clearTimeout).toHaveBeenCalledTimes(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("racing fast delay with slow timeout", async () => {
    let i = 0;
    const slow = timeout(50);
    const fast = delay(25);
    for await (const t of Channel.race([slow, fast])) {
      expect(t).toBeCloseTo(Date.now(), -1);
      i++;
      if (i > 20) {
        break;
      }
    }
    expect(i).toBe(21);
    await expect(slow.next()).resolves.toEqual({ done: true });
    await expect(fast.next()).resolves.toEqual({ done: true });
  });

  test("racing slow delay with fast timeout", async () => {
    let i = 0;
    const slow = timeout(25);
    const fast = delay(50);
    await expect(
      (async () => {
        for await (const t of Channel.race([slow, fast])) {
          expect(t).toBeCloseTo(Date.now(), -1);
          if (i++ > 20) {
            break;
          }
        }
      })(),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(i).toBe(0);
    await expect(slow.next()).resolves.toEqual({ done: true });
    await expect(fast.next()).resolves.toEqual({ done: true });
  });

  test("interval ticks", async () => {
    const timer = interval(10);
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

  test("interval calls clearInterval", async () => {
    try {
      jest.useFakeTimers();
      const timer = interval(10);
      let result = await timer.next();
      expect(result.value).toBeLessThanOrEqual(Date.now());
      expect(result.done).toBe(false);
      await timer.return();
      expect(clearInterval).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("interval does not call timer functions unnecessarily", async () => {
    try {
      jest.useFakeTimers();
      const timer = interval(50);
      await expect(timer.return()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
      expect(setInterval).toHaveBeenCalledTimes(0);
      expect(clearInterval).toHaveBeenCalledTimes(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
