import { describe, test, expect } from "@b9g/libuild/test";
import { Repeater } from "../index.js";
import { race } from "../combinators.js";

describe("disposal", () => {
  test("combinator results are disposable", async () => {
    const r = race([new Repeater<number>(() => {})]);
    expect(typeof r[Symbol.asyncDispose]).toBe("function");
    expect(typeof r[Symbol.dispose]).toBe("function");
    await r[Symbol.asyncDispose]();
    expect(await r.next()).toEqual({ done: true });
  });

  test("Symbol.asyncDispose exists and calls return", async () => {
    const r = new Repeater<number>(async (push, stop) => {
      await push(1);
      await push(2);
      await stop;
      return -1;
    });
    expect(await r.next()).toEqual({ value: 1, done: false });
    expect(typeof r[Symbol.asyncDispose]).toBe("function");
    await r[Symbol.asyncDispose]();
    expect(await r.next()).toEqual({ done: true });
    expect(await r.next()).toEqual({ done: true });
  });

  test("await using disposes the repeater on scope exit", async () => {
    let cleaned = false;
    const values: number[] = [];
    {
      await using r = new Repeater<number>(async (push, stop) => {
        stop.then(() => (cleaned = true));
        await push(1);
        await push(2);
        await push(3);
        await stop;
      });
      values.push((await r.next()).value!);
      values.push((await r.next()).value!);
    }
    expect(values).toEqual([1, 2]);
    expect(cleaned).toBe(true);
  });

  test("Symbol.dispose exists and calls return", async () => {
    const r = new Repeater<number>(async (push, stop) => {
      await push(1);
      await stop;
      return -1;
    });
    expect(await r.next()).toEqual({ value: 1, done: false });
    expect(typeof r[Symbol.dispose]).toBe("function");
    r[Symbol.dispose]();
    expect(await r.next()).toEqual({ done: true });
  });

  test("using disposes the repeater on scope exit (sync)", async () => {
    let cleaned = false;
    let r!: Repeater<number>;
    {
      using r1 = new Repeater<number>((push, stop) => {
        stop.then(() => (cleaned = true));
        push(1);
      });
      r = r1;
      await r1.next();
    }
    // Symbol.dispose called return() on scope exit.
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(cleaned).toBe(true);
  });
});
