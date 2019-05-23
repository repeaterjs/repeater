import { Channel, FixedBuffer } from "../index";

async function* gen<T>(values: T[], returned?: T): AsyncIterableIterator<T> {
  for (const value of values) {
    yield value;
  }
  return returned;
}

async function* deferredGen<T>(
  values: T[],
  returned?: T,
): AsyncIterableIterator<T> {
  for (const value of values) {
    await Promise.resolve();
    yield value;
  }
  return returned;
}

/* eslint-disable require-yield */
async function* hangingGen(): AsyncIterableIterator<any> {
  await new Promise(() => {});
}
/* eslint-enable require-yield */

function hangingChannel(): Channel<any> {
  return new Channel(() => new Promise(() => {}));
}

function delayPromise<T>(wait: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), wait));
}

function delayChannel<T>(wait: number, values: T[], returned?: T): Channel<T> {
  return new Channel<T>(async (push, close, stop) => {
    let i = 0;
    const timer = setInterval(() => {
      if (i >= values.length) {
        close();
      }
      push(values[i++]);
    }, wait);
    await stop;
    clearInterval(timer);
    return returned;
  }, new FixedBuffer(values.length));
}

describe("combinators", () => {
  describe("Channel.race", () => {
    test("Promise.resolve vs generator", async () => {
      const iter = Channel.race([Promise.resolve(-1), gen([1, 2, 3, 4, 5], 6)]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs Promise.resolve", async () => {
      const iter = Channel.race([gen([1, 2, 3, 4, 5], 6), Promise.resolve(-2)]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(6);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs deferred generator", async () => {
      const iter = Channel.race([
        Promise.resolve(-1),
        deferredGen([1, 2, 3, 4, 5], 6),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Channel.race([
        deferredGen([1, 2, 3, 4, 5], 6),
        Promise.resolve(-1),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs hanging generator", async () => {
      const iter = Channel.race([Promise.resolve(-1), hangingGen()]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("hanging generator vs Promise.resolve", async () => {
      const iter = Channel.race([hangingGen(), Promise.resolve(-1)]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("promise vs hanging generator", async () => {
      let result: IteratorResult<number>;
      const iter = Channel.race([delayPromise(200, -1), hangingGen()]);
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("hanging generator vs promise", async () => {
      let result: IteratorResult<number>;
      const iter = Channel.race([hangingGen(), delayPromise(200, -1)]);
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("channel vs promise", async () => {
      const iter = Channel.race([
        delayChannel(20, [1, 2, 3, 4, 5], 6),
        delayPromise(50, -1),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("hanging promise vs delayed promise vs slow channel vs fast channel", async () => {
      const hanging = new Promise<number>(() => {});
      const delayed = delayPromise(250, -1);
      const slow = delayChannel(160, [0, 1, 2, 3, 4]);
      const fast = delayChannel(100, [100, 101, 102, 103, 104, 105]);

      const iter = Channel.race([hanging, delayed, slow, fast]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-1);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([100, 101]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return methods called on all iterators when any finish", async () => {
      const hanging = new Promise(() => {});
      const iter1 = hangingGen();
      const iter2 = hangingChannel();
      const iter3 = delayChannel<number>(250, [], -1);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.race([hanging, iter1, iter2, iter3]);
      await expect(iter.next()).resolves.toEqual({ done: true, value: -1 });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods called on all iterators when parent return called", async () => {
      const hanging = new Promise(() => {});
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>((_, __, close) => close);
      const iter3 = new Channel<number>((_, __, close) => close);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.race([hanging, iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => {});
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.race([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });
  });

  describe("Channel.merge", () => {
    test("Promise.resolve vs generator", async () => {
      const iter = Channel.merge([
        Promise.resolve(-1),
        gen([1, 2, 3, 4, 5], 6),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(6);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs Promise.resolve", async () => {
      const iter = Channel.merge([
        gen([1, 2, 3, 4, 5], 6),
        Promise.resolve(-1),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(6);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs deferred generator", async () => {
      const iter = Channel.merge([
        Promise.resolve(-1),
        deferredGen([1, 2, 3, 4, 5], 6),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(6);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Channel.merge([
        deferredGen([1, 2, 3, 4, 5], 6),
        Promise.resolve(-1),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(6);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs deferred generator", async () => {
      const iter = Channel.merge([
        gen([1, 2, 3, 4, 5], 6),
        deferredGen([10, 20, 30, 40, 50], 60),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(60);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 10, 2, 20, 3, 30, 4, 40, 5, 50]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs generator", async () => {
      const iter = Channel.merge([
        deferredGen([10, 20, 30, 40, 50], 60),
        gen([1, 2, 3, 4, 5], 6),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(60);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 10, 2, 20, 3, 30, 4, 40, 5, 50]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("channel vs promise", async () => {
      const iter = Channel.merge([
        delayChannel(100, [1, 2, 3, 4, 5], -2),
        delayPromise(250, -1),
      ]);
      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-2);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("promise vs slow channel vs fast channel", async () => {
      const iter = Channel.merge([
        delayPromise(500, -1),
        delayChannel(160, [0, 1, 2, 3, 4], -2),
        delayChannel(100, [100, 101, 102, 103, 104, 105], -3),
      ]);

      let result: IteratorResult<number>;
      const nums: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(-2);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([100, 0, 101, 102, 1, 103, 2, 104, 105, 3, 4]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return methods called on all iterators when any finish", async () => {
      const hanging = new Promise(() => {});
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>((_, __, close) => close);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const iter = Channel.merge([hanging, iter1, iter2]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const hanging = new Promise(() => {});
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => {});
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.merge([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });
  });

  describe("Channel.zip", () => {
    test("Promise.resolve vs generator", async () => {
      const iter = Channel.zip([Promise.resolve(-1), gen([1, 2, 3, 4, 5], 6)]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, 1]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs Promise.resolve", async () => {
      const iter = Channel.zip([gen([1, 2, 3, 4, 5], 6), Promise.resolve(-1)]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([1, -1]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs deferred generator", async () => {
      const iter = Channel.zip([
        Promise.resolve(-1),
        deferredGen([10, 20, 30, 40, 50], 60),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, 10]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Channel.zip([
        deferredGen([10, 20, 30, 40, 50], 60),
        Promise.resolve(-1),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([10, -1]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("promise vs channel", async () => {
      const iter = Channel.zip([
        delayPromise(250, -1),
        delayChannel(100, [1, 2, 3, 4, 5], 6),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, 1]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("slow channel vs fast channel", async () => {
      const slow = delayChannel(160, [0, 1, 2, 3, 4], -1);
      const fast = delayChannel(100, [100, 101, 102, 103, 104, 105], -2);

      const iter = Channel.zip([slow, fast]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, 105]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([[0, 100], [1, 101], [2, 102], [3, 103], [4, 104]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return methods called on all iterators when any finish", async () => {
      const iter1 = gen([1, 2, 3, 4, 5], 6);
      const iter2 = new Channel<number>(async (push, _, stop) => {
        push(100);
        await stop;
        return -2000;
      });
      const iter3 = new Channel<number>(async (_, close, stop) => {
        setTimeout(() => close(), 250);
        await stop;
        return -3000;
      });
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.zip([iter1, iter2, iter3]);
      await expect(iter.next()).resolves.toEqual({
        value: [1, 100, -3000],
        done: true,
      });
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods called on all iterators when parent return called", async () => {
      const hanging = new Promise(() => {});
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => {});
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.zip([hanging, iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => {});
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.race([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });
  });

  describe("Channel.latest", () => {
    test("Promise.resolve vs generator", async () => {
      const iter = Channel.latest([
        Promise.resolve(-1),
        gen([1, 2, 3, 4, 5], 6),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, 6]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([[-1, 1], [-1, 2], [-1, 3], [-1, 4], [-1, 5]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs Promise.resolve", async () => {
      const iter = Channel.latest([
        gen([1, 2, 3, 4, 5], 6),
        Promise.resolve(-1),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([6, -1]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([[1, -1], [2, -1], [3, -1], [4, -1], [5, -1]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs deferred generator", async () => {
      const iter = Channel.latest([
        Promise.resolve(-1),
        deferredGen([10, 20, 30, 40, 50], 60),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, 60]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([[-1, 10], [-1, 20], [-1, 30], [-1, 40], [-1, 50]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Channel.latest([
        deferredGen([10, 20, 30, 40, 50], 60),
        Promise.resolve(-1),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([60, -1]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([[10, -1], [20, -1], [30, -1], [40, -1], [50, -1]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("promise vs channel", async () => {
      const iter = Channel.latest([
        delayPromise(250, -1),
        delayChannel(100, [1, 2, 3, 4, 5], -2),
      ]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, -2]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([[-1, 1], [-1, 2], [-1, 3], [-1, 4], [-1, 5]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("slow channel vs fast channel", async () => {
      const slow = delayChannel(160, [0, 1, 2, 3, 4], -1);
      const fast = delayChannel(100, [100, 101, 102, 103, 104, 105], -2);

      const iter = Channel.latest([slow, fast]);
      let result: IteratorResult<number[]>;
      const nums: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([-1, -2]);
        } else {
          nums.push(result.value);
        }
      } while (!result.done);
      expect(nums).toEqual([
        [0, 100],
        [0, 101],
        [0, 102],
        [1, 102],
        [1, 103],
        [2, 103],
        [2, 104],
        [2, 105],
        [3, 105],
        [4, 105],
      ]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return methods called on all iterators when parent return called", async () => {
      const hanging = new Promise(() => {});
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => {});
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.latest([hanging, iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => {});
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.race([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });
  });
});
