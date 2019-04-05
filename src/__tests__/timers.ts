import { delay, interval, timeout } from "../index";

async function* identity(iter: AsyncIterable<any>) {
  for await (const value of iter) {
    yield value;
  }
}

describe("timers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  test("delay resolves", async () => {
    const timer = delay(5000);
    const resultP = timer.next();
    await Promise.resolve(); // clear promise queue
    jest.advanceTimersByTime(5000);
    const result = await resultP;
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    await expect(timer.next()).resolves.toEqual({ done: true });
  });

  test("delay cancels", async () => {
    const timer = delay(5000);
    await Promise.resolve(); // clear promise queue
    jest.advanceTimersByTime(4999); // monkaS
    timer.return();
    await expect(timer.next()).resolves.toEqual({ done: true });
    await expect(timer.next()).resolves.toEqual({ done: true });
  });

  test("delay does not call setTimeout unnecessarily", async () => {
    const timer = delay(20);
    await Promise.resolve(); // clear promise queue
    jest.advanceTimersByTime(30);
    timer.return();
    const timer1 = timeout(20);
    await Promise.resolve(); // clear promise queue
    jest.advanceTimersByTime(30);
    identity(timer1).return!();
    expect(setTimeout).toBeCalledTimes(0);
  });

  test("timeout rejects", async () => {
    const timer = timeout(5000);
    const resultP = timer.next();
    await Promise.resolve(); // clear promise queue
    jest.advanceTimersByTime(5000);
    await expect(resultP).rejects.toBeDefined();
    await expect(timer.next()).rejects.toBeDefined();
    await expect(timer.next()).rejects.toBeDefined();
  });

  test("timeout cancels", async () => {
    const timer = timeout(5000);
    await Promise.resolve(); // clear promise queue
    jest.advanceTimersByTime(4999); // monkaS
    timer.return();
    await expect(timer.next()).resolves.toEqual({ done: true });
    await expect(timer.next()).resolves.toEqual({ done: true });
  });

  test("interval ticks", async () => {
    const timer = interval(500);
    let result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    jest.advanceTimersByTime(500);
    result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    jest.advanceTimersByTime(500);
    result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    jest.advanceTimersByTime(500);
    result = await timer.next();
    expect(result.value).toBeLessThanOrEqual(Date.now());
    expect(result.done).toBe(false);
    timer.return();
    result = await timer.next();
    expect(result).toEqual({ done: true });
    expect(clearInterval).toBeCalled();
  });

  test("interval does not call setInterval unnecessarily", () => {
    const timer = interval(50);
    identity(timer).return!();
    expect(setInterval).toBeCalledTimes(0);
  });
});
