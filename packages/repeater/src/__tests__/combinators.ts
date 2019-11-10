import { Repeater } from "../repeater";
import {
  AssertTypeEquals,
  deferredGen,
  delayRepeater,
  delayPromise,
  gen,
  hangingGen,
} from "./_testutils";

// TODO: maybe use timer mocks to make this test suite execute faster
describe("combinators", () => {
  describe("Repeater.race", () => {
    test("empty", async () => {
      const iter = Repeater.race([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("single iterator", async () => {
      const iter = Repeater.race([delayRepeater(10, [1, 2, 3], 4)]);
      await expect(iter.next()).resolves.toEqual({ value: 1, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 2, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 3, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 4, done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs generator", async () => {
      const iter = Repeater.race([
        Promise.resolve("z"),
        gen([1, 2, 3, 4, 5], 6),
      ]);
      await expect(iter.next()).resolves.toEqual({ value: "z", done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs Promise.resolve", async () => {
      const iter = Repeater.race([
        gen([1, 2, 3, 4, 5], 6),
        Promise.resolve("z"),
      ]);
      await expect(iter.next()).resolves.toEqual({ value: 1, done: false });
      await expect(iter.next()).resolves.toEqual({ value: "z", done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs deferred generator", async () => {
      const iter = Repeater.race([
        Promise.resolve("z"),
        deferredGen([1, 2, 3, 4, 5], 6),
      ]);
      await expect(iter.next()).resolves.toEqual({ value: "z", done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Repeater.race([
        deferredGen([1, 2, 3, 4, 5], 6),
        Promise.resolve("z"),
      ]);
      await expect(iter.next()).resolves.toEqual({ value: "z", done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs hanging generator", async () => {
      const iter = Repeater.race([Promise.resolve(-1), hangingGen()]);
      await expect(iter.next()).resolves.toEqual({ value: -1, done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("hanging generator vs Promise.resolve", async () => {
      const iter = Repeater.race([hangingGen(), Promise.resolve(-1)]);
      await expect(iter.next()).resolves.toEqual({ value: -1, done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("promise vs hanging generator", async () => {
      const iter = Repeater.race([delayPromise(10, -1), hangingGen()]);
      await expect(iter.next()).resolves.toEqual({ value: -1, done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("hanging generator vs promise", async () => {
      const iter = Repeater.race([hangingGen(), delayPromise(200, -1)]);
      await expect(iter.next()).resolves.toEqual({ value: -1, done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("repeater vs promise", async () => {
      const iter = Repeater.race([
        delayRepeater(40, [1, 2, 3, 4, 5], 6),
        delayPromise(100, "z"),
      ]);
      await expect(iter.next()).resolves.toEqual({ value: 1, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 2, done: false });
      await expect(iter.next()).resolves.toEqual({ value: "z", done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("slow repeater vs fast repeater", async () => {
      const slow = delayRepeater(120, [0, 1, 2], -1);
      const fast = delayRepeater(100, [100, 101, 102, 103, 104, 105, 106], -2);
      const iter = Repeater.race([slow, fast]);
      await expect(iter.next()).resolves.toEqual({ value: 100, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 101, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 102, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 103, done: false });
      await expect(iter.next()).resolves.toEqual({ value: -1, done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("hanging promise vs delayed promise vs slow repeater vs fast repeater", async () => {
      const hanging = new Promise(() => {});
      const delayed = delayPromise<string>(250, "z");
      const slow = delayRepeater(160, [0, 1, 2, 3, 4], -1);
      const fast = delayRepeater(100, [100, 101, 102, 103, 104, 105], -2);
      const iter = Repeater.race([hanging, delayed, slow, fast]);
      await expect(iter.next()).resolves.toEqual({ value: 100, done: false });
      await expect(iter.next()).resolves.toEqual({ value: 101, done: false });
      await expect(iter.next()).resolves.toEqual({ value: "z", done: true });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return methods called on all iterators when any finish", async () => {
      const hanging = new Promise(() => {});
      const iter1 = hangingGen();
      const iter2 = delayRepeater<number>(1000, [1, 2, 3], -1);
      const iter3 = delayRepeater<number>(250, [], -2);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.race([hanging, iter1, iter2, iter3]);
      await expect(iter.next()).resolves.toEqual({ done: true, value: -2 });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods called on all iterators when parent return called", async () => {
      const hanging = new Promise(() => {});
      const iter1 = hangingGen();
      const iter2 = new Repeater(() => {});
      const iter3 = delayRepeater(250, []);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.race([hanging, iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const hanging = new Promise(() => {});
      const iter1 = hangingGen();
      const iter2 = new Repeater(() => {});
      const iter3 = delayRepeater(250, []);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.race([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });

    test("one iterator errors", async () => {
      const hanging = new Promise(() => {});
      const iter1 = hangingGen<boolean>();
      const iter2 = new Repeater<string>((push, stop) => {
        push("a");
        push("b");
        return stop;
      });
      const error = new Error("Repeater.race error");
      const iter3 = delayRepeater<number>(100, [1, 2, 3], undefined, error);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.race([hanging, iter1, iter2, iter3]);

      await expect(iter.next()).resolves.toEqual({ value: "a", done: false });
      await expect(iter.next()).resolves.toEqual({ value: "b", done: false });
      await expect(iter.next()).resolves.toEqual({ value: 3, done: false });
      await expect(iter.next()).rejects.toBe(error);
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("type inference", async () => {
      const iter1 = delayRepeater(100, [1, 2, 3]);
      const iter2 = delayRepeater(100, ["a", "b", "c"]);
      const iter3 = delayRepeater(100, [
        Promise.resolve("a"),
        Promise.resolve("b"),
        Promise.resolve("c"),
      ]);
      const iter4 = [Promise.resolve(null), null, Promise.resolve(null)];
      const iter = Repeater.race([
        iter1,
        iter2,
        iter3,
        iter4,
        Promise.resolve(false),
        true,
      ]);
      const assertion: AssertTypeEquals<
        typeof iter,
        Repeater<string | number | null>
      > = true;
      expect(assertion).toBe(true);
    });
  });

  describe("Repeater.merge", () => {
    test("empty", async () => {
      const iter = Repeater.merge([]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("single iterator", async () => {
      const iter = Repeater.merge([delayRepeater(100, [1, 2, 3], 4)]);
      let result: IteratorResult<number>;
      const values: number[] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual(4);
        } else {
          values.push(result.value);
        }
      } while (!result.done);
      expect(values).toEqual([1, 2, 3]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs generator", async () => {
      const iter = Repeater.merge([
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
      expect(nums).toEqual([1, -1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("multiple promises", async () => {
      const a = delayPromise(300, "a");
      const b = delayPromise(200, "b");
      const c = delayPromise(100, "c");
      const d = delayPromise(400, "d");
      const iter = Repeater.merge([a, b, c, d]);
      await expect(iter.next()).resolves.toEqual({ value: "c", done: false });
      await expect(iter.next()).resolves.toEqual({ value: "b", done: false });
      await expect(iter.next()).resolves.toEqual({ value: "a", done: false });
      await expect(iter.next()).resolves.toEqual({ value: "d", done: false });
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs Promise.resolve", async () => {
      const iter = Repeater.merge([
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
      expect(nums).toEqual([1, -1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs deferred generator", async () => {
      const iter = Repeater.merge([
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
      expect(nums).toEqual([-1, 1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("deferred generator vs Promise.resolve", async () => {
      const iter = Repeater.merge([
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
      expect(nums).toEqual([-1, 1, 2, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("generator vs deferred generator", async () => {
      const iter = Repeater.merge([
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
      const iter = Repeater.merge([
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

    test("repeater vs promise", async () => {
      const iter = Repeater.merge([
        delayRepeater(100, [1, 2, 3, 4, 5], -2),
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
      expect(nums).toEqual([1, 2, -1, 3, 4, 5]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("promise vs slow repeater vs fast repeater", async () => {
      const iter = Repeater.merge([
        delayPromise(530, -1),
        delayRepeater(160, [0, 1, 2, 3, 4], -2),
        delayRepeater(100, [100, 101, 102, 103, 104, 105], -3),
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
      expect(nums).toEqual([100, 0, 101, 102, 1, 103, 2, 104, -1, 105, 3, 4]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("return methods called on all iterators when parent return called", async () => {
      const iter1 = delayRepeater(100, [1]);
      const iter2 = delayRepeater(10000, [2]);
      const iter3 = new Repeater<number>(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.merge([iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const hanging = new Promise(() => {});
      const iter1 = hangingGen();
      const iter2 = new Repeater<number>(() => {});
      const iter3 = delayRepeater(10000, [1]);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.merge([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });

    test("one iterator errors", async () => {
      const iter1 = delayRepeater(120, Array<boolean>(10).fill(true), false);
      const iter2 = new Repeater<string>((push) => {
        push("a");
        push("b");
      });
      const error = new Error("Repeater.merge error");
      const iter3 = delayRepeater<number>(250, [1, 2, 3], undefined, error);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.merge([iter1, iter2, iter3]);

      let result: IteratorResult<number | string | boolean>;
      const values: (number | string | boolean)[] = [];
      await expect(
        (async () => {
          do {
            result = await iter.next();
            expect(result.done).toBe(false);
            values.push(result.value);
          } while (!result.done);
        })(),
      ).rejects.toBe(error);
      expect(values).toEqual([
        "a",
        "b",
        true,
        true,
        1,
        true,
        true,
        2,
        true,
        true,
        3,
        true,
        true,
      ]);
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("type inference", async () => {
      const iter1 = delayRepeater(100, [1, 2, 3]);
      const iter2 = delayRepeater(100, ["a", "b", "c"]);
      const iter3 = delayRepeater(100, [
        Promise.resolve("a"),
        Promise.resolve("b"),
        Promise.resolve("c"),
      ]);
      const iter4 = [Promise.resolve(null), null, Promise.resolve(null)];
      const iter = Repeater.merge([
        iter1,
        iter2,
        iter3,
        iter4,
        Promise.resolve(false),
        false,
      ]);
      const assertion: AssertTypeEquals<
        typeof iter,
        Repeater<string | number | null | boolean>
      > = true;
      expect(assertion).toBe(true);
    });
  });

  describe("Repeater.zip", () => {
    test("empty", async () => {
      const iter = Repeater.zip([]);
      await expect(iter.next()).resolves.toEqual({ value: [], done: true });
    });

    test("single iterator", async () => {
      const iter = Repeater.zip([delayRepeater(100, [1, 2, 3], 4)]);
      let result: IteratorResult<number[]>;
      const values: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([4]);
        } else {
          values.push(result.value);
        }
      } while (!result.done);
      expect(values).toEqual([[1], [2], [3]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs generator", async () => {
      const iter = Repeater.zip([Promise.resolve(-1), gen([1, 2, 3, 4, 5], 6)]);
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
      const iter = Repeater.zip([gen([1, 2, 3, 4, 5], 6), Promise.resolve(-1)]);
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
      const iter = Repeater.zip([
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
      const iter = Repeater.zip([
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

    test("promise vs repeater", async () => {
      const iter = Repeater.zip([
        delayPromise(250, -1),
        delayRepeater(100, [1, 2, 3, 4, 5], 6),
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

    test("slow repeater vs fast repeater", async () => {
      const slow = delayRepeater(160, [0, 1, 2, 3, 4], -1);
      const fast = delayRepeater(100, [100, 101, 102, 103, 104, 105], -2);

      const iter = Repeater.zip([slow, fast]);
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
      const iter1 = gen(["a", "b", "c", "d", "e"], "f");
      const iter2 = delayRepeater(100, [false], true);
      const iter3 = delayRepeater<number>(250, [], -3000);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.zip([iter1, iter2, iter3]);
      await expect(iter.next()).resolves.toEqual({
        value: ["a", false, -3000],
        done: true,
      });
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods called on all iterators when parent return called", async () => {
      const iter1 = delayRepeater(2500, [1]);
      const iter2 = delayRepeater(10000, [2]);
      const iter3 = new Repeater<string>(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.zip([iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const iter1 = hangingGen();
      const iter2 = new Repeater<number>(() => {});
      const iter3 = delayRepeater<boolean>(250, []);
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.zip([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({
        done: true,
      });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });

    test("one iterator errors", async () => {
      const iter1 = delayRepeater(100, [false, true, false, true]);
      const iter2 = new Repeater<string>((push) => {
        push("a");
        push("b");
        push("c");
        push("d");
      });
      const error = new Error("Repeater.zip error");
      const iter3 = delayRepeater<number>(150, [1, 2, 3], undefined, error);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.zip([iter1, iter2, iter3]);

      let result: IteratorResult<[boolean, string, number]>;
      const values: [boolean, string, number][] = [];
      await expect(
        (async () => {
          do {
            result = await iter.next();
            expect(result.done).toBe(false);
            values.push(result.value);
          } while (!result.done);
        })(),
      ).rejects.toBe(error);
      expect(values).toEqual([
        [false, "a", 1],
        [true, "b", 2],
        [false, "c", 3],
      ]);
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("type inference", async () => {
      const iter1 = delayRepeater(100, [1, 2, 3]);
      const iter2 = delayRepeater(100, ["a", "b", "c"]);
      const iter3 = delayRepeater(100, [
        Promise.resolve("a"),
        Promise.resolve("b"),
        Promise.resolve("c"),
      ]);
      const iter4 = [Promise.resolve(null), null, Promise.resolve(null)];
      const iter = Repeater.zip([
        iter1,
        iter2,
        iter3,
        iter4,
        Promise.resolve(false),
        true,
      ]);
      const assertion: AssertTypeEquals<
        typeof iter,
        Repeater<[number, string, string, null, boolean, boolean]>
      > = true;
      expect(assertion).toBe(true);
    });
  });

  describe("Repeater.latest", () => {
    test("empty", async () => {
      const iter = Repeater.latest([]);
      await expect(iter.next()).resolves.toEqual({ value: [], done: true });
    });

    test("single iterator", async () => {
      const iter = Repeater.latest([delayRepeater(100, [1, 2, 3], 4)]);
      let result: IteratorResult<number[]>;
      const values: number[][] = [];
      do {
        result = await iter.next();
        if (result.done) {
          expect(result.value).toEqual([4]);
        } else {
          values.push(result.value);
        }
      } while (!result.done);
      expect(values).toEqual([[1], [2], [3]]);
      await expect(iter.next()).resolves.toEqual({ done: true });
    });

    test("Promise.resolve vs generator", async () => {
      const iter = Repeater.latest([
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
      const iter = Repeater.latest([
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
      const iter = Repeater.latest([
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
      const iter = Repeater.latest([
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

    test("promise vs repeater", async () => {
      const iter = Repeater.latest([
        delayPromise(250, -1),
        delayRepeater(100, [1, 2, 3, 4, 5], -2),
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

    test("slow repeater vs fast repeater", async () => {
      const slow = delayRepeater(160, [0, 1, 2, 3, 4], -1);
      const fast = delayRepeater(100, [100, 101, 102, 103, 104, 105], -2);

      const iter = Repeater.latest([slow, fast]);
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
      const iter1 = delayRepeater(250, [1]);
      const iter2 = delayRepeater(10000, [2]);
      const iter3 = new Repeater<string>(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.latest([iter1, iter2, iter3]);
      iter.next();
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("return methods on all iterators not called when parent iterator return called prematurely", async () => {
      const iter1 = hangingGen();
      const iter2 = new Repeater<number>(() => {});
      const iter3 = delayRepeater(250, []);
      const hanging = new Promise(() => {});
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.latest([hanging, iter1, iter2, iter3]);
      await expect(iter.return()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(0);
      expect(spy2).toHaveBeenCalledTimes(0);
      expect(spy3).toHaveBeenCalledTimes(0);
    });

    test("one iterator errors", async () => {
      const iter1 = delayRepeater(80, [false, true, false, true]);
      const iter2 = new Repeater<string>((push) => {
        push("a");
        push("b");
        push("c");
        push("d");
      });
      const error = new Error("Repeater.latest error");
      const iter3 = delayRepeater<number>(150, [1, 2, 3], undefined, error);
      const spy1 = jest.spyOn(iter1, "return");
      const spy2 = jest.spyOn(iter2, "return");
      const spy3 = jest.spyOn(iter3, "return");
      const iter = Repeater.latest([iter1, iter2, iter3]);

      let result: IteratorResult<[boolean, string, number]>;
      const values: [boolean, string, number][] = [];
      await expect(
        (async () => {
          do {
            result = await iter.next();
            expect(result.done).toBe(false);
            values.push(result.value);
          } while (!result.done);
        })(),
      ).rejects.toBe(error);
      expect(values).toEqual([
        [false, "a", 1],
        [false, "b", 1],
        [false, "c", 1],
        [false, "d", 1],
        [true, "d", 1],
        [false, "d", 1],
        [false, "d", 2],
        [true, "d", 2],
        [true, "d", 3],
      ]);
      await expect(iter.next()).resolves.toEqual({ done: true });
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy3).toHaveBeenCalledTimes(1);
    });

    test("type inference", async () => {
      const iter1 = delayRepeater(100, [1, 2, 3]);
      const iter2 = delayRepeater(100, ["a", "b", "c"]);
      const iter3 = delayRepeater(100, [
        Promise.resolve("a"),
        Promise.resolve("b"),
        Promise.resolve("c"),
      ]);
      const iter4 = [Promise.resolve(null), null, Promise.resolve(null)];
      const iter = Repeater.latest([
        iter1,
        iter2,
        iter3,
        iter4,
        Promise.resolve(false),
        true,
      ]);
      const assertion: AssertTypeEquals<
        typeof iter,
        Repeater<[number, string, string, null, boolean, boolean]>
      > = true;
      expect(assertion).toBe(true);
    });
  });
});
