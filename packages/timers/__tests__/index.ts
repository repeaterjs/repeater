import { delay, interval, timeout, TimeoutError } from "../index";

describe("timers", () => {
  test("delay resolves", async () => {
    const timer = delay(10);
    const result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    await expect(timer.next()).resolves.toEqual({ done: true });
  });

  test("delay cancels", async () => {
    const tortoise = delay(4);
    const hare = delay(2);
    const t = tortoise.next();
    const h = hare.next();
    const result = await Promise.race([t, h]);
    expect(result.done).toEqual(false);
    await tortoise.return();
    await expect(t).resolves.toEqual({ done: true });
    await expect(hare.next()).resolves.toEqual({ done: true });
  });

  test("delay rejects", async () => {
    const timer = delay(10, { reject: true });
    await expect(timer.next()).rejects.toBeInstanceOf(TimeoutError);
    await expect(timer.next()).rejects.toBeInstanceOf(TimeoutError);
    await expect(timer.next()).rejects.toBeInstanceOf(TimeoutError);
  });

  test("delay does not call setTimeout unnecessarily", async () => {
    try {
      jest.useFakeTimers();
      const timer = delay(1);
      timer.return();
      jest.advanceTimersByTime(1000);
      expect(setTimeout).toBeCalledTimes(0);
      expect(clearTimeout).toBeCalledTimes(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test("timeout rejects with no args", async () => {
    const p = timeout(5);
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  test("timeout rejects with slow promise", async () => {
    const timer = delay(10);
    const p = timeout(5, timer.next());
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  test("timeout cancels", async () => {
    const timer = delay(5);
    const result = await timeout(10, timer.next());
    expect(result.done).toBe(false);
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
      expect(clearInterval).toBeCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("interval does not call setInterval unnecessarily", async () => {
    try {
      jest.useFakeTimers();
      const timer = interval(50);
      await timer.return();
      expect(setInterval).toBeCalledTimes(0);
      expect(clearInterval).toBeCalledTimes(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
