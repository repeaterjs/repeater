import { throttler, semaphore } from "../index";

describe("limiters", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("semaphore", async () => {
    const tokens = semaphore(4);
    const t1 = (await tokens.next()).value;
    expect(t1.remaining).toEqual(3);
    const t2 = (await tokens.next()).value;
    expect(t2.remaining).toEqual(2);
    const t3 = (await tokens.next()).value;
    expect(t3.remaining).toEqual(1);
    const t4 = (await tokens.next()).value;
    expect(t4.remaining).toEqual(0);
    t1.release();
    t2.release();
    const t5 = (await tokens.next()).value;
    expect(t5.remaining).toEqual(1);
    t3.release();
    const t6 = (await tokens.next()).value;
    expect(t6.remaining).toEqual(1);
  });

  test("throttler cleans up", async () => {
    const throttle = throttler(1000, 8);
    await throttle.next();
    expect(setInterval).toBeCalledTimes(1);
    await throttle.return!();
    expect(clearInterval).toBeCalledTimes(1);
  });

  test("throttler tracks remaining by interval", async () => {
    let remaining = 8;
    let i = 0;
    for await (const token of throttler(1000, 8)) {
      remaining--;
      expect(token.remaining).toEqual(remaining);
      if (token.remaining === 0) {
        jest.advanceTimersByTime(1000);
        remaining = 8;
      }
      if (i++ >= 40) {
        break;
      }
    }
    expect(clearInterval).toBeCalledTimes(1);
  });
});
