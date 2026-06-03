import { describe, test, expect } from "@b9g/libuild/test";
import { safeRace, isPromiseLike, isIteratorLike } from "../_utils.js";

const never = () => new Promise(() => {});
const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const reject = (ms: number, err: unknown) =>
  new Promise((_, reject) => setTimeout(() => reject(err), ms));

describe("safeRace", () => {
  test("resolves to the first settled value", async () => {
    expect(await safeRace([after(50, "slow"), after(5, "fast")])).toBe("fast");
  });

  test("rejects if the first to settle rejects", async () => {
    const error = new Error("safeRace rejection");
    await expect(safeRace([after(50, "slow"), reject(5, error)])).rejects.toBe(
      error,
    );
  });

  test("non-thenable contenders resolve immediately", async () => {
    expect(await safeRace([never(), 42])).toBe(42);
  });

  test("an already-settled contender wins over a pending one", async () => {
    expect(await safeRace([never(), Promise.resolve("done")])).toBe("done");
  });

  test("a never-settling contender does not block a settling one", async () => {
    expect(await safeRace([never(), after(5, "ok")])).toBe("ok");
  });

  test("the same promise can be raced across multiple calls", async () => {
    const shared = after(5, "shared");
    const a = safeRace([shared, never()]);
    const b = safeRace([never(), shared]);
    expect(await a).toBe("shared");
    expect(await b).toBe("shared");
  });

  test("races work against an undefined sentinel (combinator pattern)", async () => {
    // Mirrors `safeRace([work, stop])` where stop resolves to undefined.
    expect(await safeRace([never(), Promise.resolve(undefined)])).toBeUndefined();
  });

  test("handles many contenders where a late one wins", async () => {
    const contenders = [never(), never(), never(), after(10, "winner")];
    expect(await safeRace(contenders)).toBe("winner");
  });
});

describe("type guards", () => {
  test("isPromiseLike", () => {
    expect(isPromiseLike(Promise.resolve())).toBe(true);
    expect(isPromiseLike({ then() {} })).toBe(true);
    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(42)).toBe(false);
    expect(isPromiseLike({})).toBe(false);
  });

  test("isIteratorLike", () => {
    expect(isIteratorLike({ next() {} })).toBe(true);
    expect(isIteratorLike([].values())).toBe(true);
    expect(isIteratorLike(null)).toBe(false);
    expect(isIteratorLike({})).toBe(false);
  });
});
