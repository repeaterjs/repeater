import { delay, interval, resources, timeout } from "../index";

async function* identity(iter: AsyncIterable<any>) {
  for await (const value of iter) {
    yield value;
  }
}

describe("timers", () => {
  describe("delay", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    test("resolves", async () => {
      const timer = delay(5000);
      const resultP = timer.next();
      await Promise.resolve(); // clear promise queue
      jest.advanceTimersByTime(5000);
      const result = await resultP;
      expect(result.value).toBeLessThanOrEqual(Date.now());
      expect(result.done).toBe(false);
      await expect(timer.next()).resolves.toEqual({ done: true });
    });

    test("cancels", async () => {
      const timer = delay(5000);
      await Promise.resolve(); // clear promise queue
      jest.advanceTimersByTime(4999); // monkaS
      timer.return();
      await expect(timer.next()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
    });

    test("does not call setTimeout unnecessarily", async () => {
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
  });

  describe("timeout", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("cancels", async () => {
      const timer = timeout(5000);
      await Promise.resolve(); // clear promise queue
      jest.advanceTimersByTime(4999); // monkaS
      timer.return();
      await expect(timer.next()).resolves.toEqual({ done: true });
      await expect(timer.next()).resolves.toEqual({ done: true });
    });

    test("rejects", async () => {
      const timer = timeout(5000);
      const resultP = timer.next();
      await Promise.resolve(); // clear promise queue
      jest.advanceTimersByTime(5000);
      await expect(resultP).rejects.toBeDefined();
      await expect(timer.next()).rejects.toBeDefined();
      await expect(timer.next()).rejects.toBeDefined();
    });
  });

  describe("interval", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("interval", async () => {
      const timer = interval(500);
      const resultP = timer.next();
      await Promise.resolve(); // clear promise queue
      jest.advanceTimersByTime(500);
      let result: IteratorResult<number>;
      result = await resultP;
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

    test("does not call setInterval unnecessarily", () => {
      const timer = interval(50);
      identity(timer).return!();
      expect(setInterval).toBeCalledTimes(0);
    });
  });

  describe("resources", () => {
    test("remaining", async () => {
      const tokens = resources(4);
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

    // TODO: Figure out how to do this with timer mocks. Using fake timers makes each iteration in sequence with no concurrency.
    test("limit concurrent resources", async () => {
      const max = 8;
      let i = 0;
      const tokens = resources(max, () => i++);
      const result = Array.from(Array(100).keys());
      const used = new Set<number>();
      const result1 = Promise.all(
        result.map(async (i) => {
          const token = (await tokens.next()).value;
          if (!token) {
            throw new Error("Out of tokens");
          }
          expect(used.has(token.resource!)).toBe(false);
          expect(used.size).toBeLessThan(8);
          used.add(token.resource!);
          await delay(Math.random() * 50).next();
          used.delete(token.resource!);
          token.release();
          return i;
        }),
      );
      await expect(result1).resolves.toEqual(result);
      tokens.return!();
      expect(tokens.next()).resolves.toEqual({ done: true });
    });
  });
});
