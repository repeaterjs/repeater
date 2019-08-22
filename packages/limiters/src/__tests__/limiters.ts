import { semaphore, throttler } from "../limiters";

describe("limiters", () => {
  test("semaphore", async () => {
    const tokens = semaphore(4);
    let i = 0;
    for await (const token of tokens) {
      expect(token.id).toBe(i);
      expect(token.remaining).toBe(3);
      i++;
      token.release();
      if (i > 100) {
        break;
      }
    }
  });

  test("semaphore remaining", async () => {
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

  test("throttler", async () => {
    let prev = Date.now();
    let i = 0;
    const wait = 200;
    for await (const _ of throttler(wait, { limit: 8 })) {
      const next = Date.now();
      if (i !== 0 && i % 8 === 0) {
        expect(prev + wait).toBeCloseTo(next, -1.5);
      } else {
        expect(prev).toBeCloseTo(next, -1.5);
      }
      if (i >= 40) {
        break;
      }
      i++;
      prev = next;
    }
  });

  test("throttler timer window slides", async () => {
    let prev = Date.now();
    let i = 0;
    const wait = 200;
    const spy = jest.spyOn(window, "setTimeout");
    for await (const _ of throttler(wait, { limit: 8 })) {
      const next = Date.now();
      expect(prev).toBeCloseTo(next, -1.5);
      if (i % 8 === 0) {
        await new Promise((resolve) => setTimeout(resolve, wait * 2));
      }
      if (i >= 40) {
        break;
      }
      i++;
      prev = Date.now();
    }
    // called 7 times by delay timer
    // called 6 times by the promise
    expect(spy).toHaveBeenCalledTimes(13);
  });

  test("throttler token reset", async () => {
    let i = 0;
    const wait = 200;
    for await (const token of throttler(wait, { limit: 8 })) {
      expect(token.reset).toBeCloseTo(Date.now() + wait, -1.5);
      if (i >= 40) {
        break;
      }
      i++;
    }
  });

  test("throttler token remaining", async () => {
    let remaining = 8;
    let i = 0;
    const wait = 200;
    for await (const token of throttler(wait, { limit: 8 })) {
      remaining--;
      expect(token.remaining).toEqual(remaining);
      if (token.remaining === 0) {
        remaining = 8;
      }
      i++;
      if (i >= 40) {
        break;
      }
    }
  });

  test("throttler with cooldown", async () => {
    let i = 0;
    const wait = 200;
    let prev = Date.now();
    for await (const _ of throttler(wait, { cooldown: true })) {
      const next = Date.now();
      expect(prev + wait).toBeCloseTo(next, -1.5);
      if (i >= 4) {
        break;
      }
      i++;
      prev = next;
    }
  });

  test("throttler cleans up", async () => {
    try {
      jest.useFakeTimers();
      const throttle = throttler(200, { limit: 8 });
      await throttle.next();
      expect(setTimeout).toHaveBeenCalledTimes(1);
      await expect(throttle.return()).resolves.toEqual({ done: true });
      expect(clearTimeout).toHaveBeenCalledTimes(2);
      await expect(throttle.next()).resolves.toEqual({ done: true });
    } finally {
      jest.useRealTimers();
    }
  });
});
