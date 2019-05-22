import { Channel } from "../index";

describe("combinators", () => {
  async function* gen(): AsyncIterableIterator<number> {
    yield 1;
    yield 2;
    yield 3;
    yield 4;
    yield 5;
    return 6;
  }

  async function* deferredGen(): AsyncIterableIterator<number> {
    await Promise.resolve();
    yield 10;
    await Promise.resolve();
    yield 20;
    await Promise.resolve();
    yield 30;
    await Promise.resolve();
    yield 40;
    await Promise.resolve();
    yield 50;
    await Promise.resolve();
    return 60;
  }

  async function* hangingGen(): AsyncIterableIterator<number> {
    await new Promise(() => {});
    yield -1000;
  }

  describe("Channel.race", () => {
    test("Promise.resolve vs generator", async () => {
      const iter = Channel.race([Promise.resolve(-1), gen()]);
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
      const iter = Channel.race([gen(), Promise.resolve(-1)]);
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
      const iter = Channel.race([Promise.resolve(-1), deferredGen()]);
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
      const iter = Channel.race([deferredGen(), Promise.resolve(-1)]);
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

    test("setTimeout promise vs hanging generator", async () => {
      const promise = new Promise<number>((resolve) =>
        setTimeout(() => resolve(-1), 200),
      );
      let result: IteratorResult<number>;
      const iter = Channel.race([promise, hangingGen()]);
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

    test("hanging generator vs setTimeout promise", async () => {
      const promise = new Promise<number>((resolve) =>
        setTimeout(() => resolve(-1), 200),
      );
      let result: IteratorResult<number>;
      const iter = Channel.race([hangingGen(), promise]);
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

    test("setTimeout promise vs hanging channel", async () => {
      const chan = new Channel<number>(async () => {
        await new Promise(() => {});
      });
      const promise = new Promise<number>((resolve) =>
        setTimeout(() => resolve(-1), 25),
      );
      const iter = Channel.race([chan, promise]);
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

    test("hanging channel vs setTimeout promise", async () => {
      const chan = new Channel<number>(async () => {
        await new Promise(() => {});
      });
      const promise = new Promise<number>((resolve) =>
        setTimeout(() => resolve(-1), 25),
      );
      const iter = Channel.race([promise, chan]);
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

    test("setInterval channel vs setTimeout promise", async () => {
      const chan = new Channel<number>(async (push, _, stop) => {
        let i = 1;
        const timer = setInterval(() => push(i++), 100);
        await stop;
        clearInterval(timer);
      });
      const promise = new Promise<number>((resolve) =>
        setTimeout(() => resolve(-1), 250),
      );
      const iter = Channel.race([chan, promise]);
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

    test("setInterval channel vs faster setInterval channel vs setTimeout promise", async () => {
      const chan1 = new Channel<number>(async (push, _, stop) => {
        let i = 0;
        const timer = setInterval(() => {
          push(i++);
        }, 160);
        await stop;
        clearInterval(timer);
      });

      const chan2 = new Channel<number>(async (push, _, stop) => {
        let i = 100;
        const timer = setInterval(() => {
          push(i++);
        }, 100);
        await stop;
        clearInterval(timer);
      });

      const promise = new Promise<number>((resolve) => {
        setTimeout(() => resolve(-1), 250);
      });

      const iter = Channel.race([chan1, chan2, promise]);
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

    test("return method called on all iterators when any finish", async () => {
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>(() => new Promise(() => {}));
      const iter3 = new Channel<number>((_, close) => {
        setTimeout(() => close(), 250);
      });
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Channel.race([hanging, iter1, iter2, iter3]);
      iter.next();
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return method called on all iterators when parent return is called", async () => {
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>((_, __, close) => close);
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const iter = Channel.race([hanging, iter1, iter2]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    test("return should not be called if iterator is not started", async () => {
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
      const iter = Channel.merge([Promise.resolve(-1), gen()]);
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
      const iter = Channel.merge([gen(), Promise.resolve(-1)]);
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
      const iter = Channel.merge([Promise.resolve(-1), deferredGen()]);
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
      expect(nums).toEqual([10, 20, 30, 40, 50]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Channel.merge([deferredGen(), Promise.resolve(-1)]);
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
      expect(nums).toEqual([10, 20, 30, 40, 50]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs deferred generator", async () => {
      const iter = Channel.merge([gen(), deferredGen()]);
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
      const iter = Channel.merge([deferredGen(), gen()]);
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

    test("setInterval channel vs setTimeout promise", async () => {
      const promise = new Promise<number>((resolve) =>
        setTimeout(() => resolve(-1), 250),
      );

      const chan = new Channel<number>(async (push, close, stop) => {
        let i = 1;
        const timer = setInterval(() => {
          push(i++);
          if (i > 5) {
            close();
          }
        }, 100);
        await stop;
        clearInterval(timer);
        return -2;
      });

      const iter = Channel.merge([chan, promise]);
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

    test("setInterval channel vs faster setInterval channel vs setTimeout promise", async () => {
      const promise = new Promise<number>((resolve) => {
        setTimeout(() => resolve(-1), 500);
      });

      const chan1 = new Channel<number>(async (push, close, stop) => {
        let i = 0;
        const timer = setInterval(() => {
          push(i++);
          if (i > 5) {
            close();
          }
        }, 160);
        await stop;
        clearInterval(timer);
        return -2;
      });

      const chan2 = new Channel<number>(async (push, close, stop) => {
        let i = 100;
        const timer = setInterval(() => {
          push(i++);
          if (i > 105) {
            close();
          }
        }, 100);
        await stop;
        clearInterval(timer);
        return -3;
      });

      const iter = Channel.merge([chan1, chan2, promise]);
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
      expect(nums).toEqual([100, 0, 101, 102, 1, 103, 2, 104, 105, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return method called on all iterators when parent return is called", async () => {
      const iter1: AsyncIterableIterator<number> = (async function*() {
        await new Promise(() => {});
        yield 0;
      })();
      const iter2 = new Channel<number>((_, __, close) => close);
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const iter = Channel.merge([hanging, iter1, iter2]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
    });

    test("return should not be called if iterator is not started", async () => {
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
      const iter = Channel.merge([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });
  });
});
