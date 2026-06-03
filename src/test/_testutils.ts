import { Repeater, FixedBuffer } from "../index.js";

// take from https://2ality.com/2019/07/testing-static-types.html
export type AssertTypeEquals<T, TExpected> = T extends TExpected
  ? TExpected extends T
    ? true
    : never
  : never;

export async function* gen<T>(
  values: T[],
  returned?: T,
  error?: Error,
): AsyncIterableIterator<T> {
  for (const value of values) {
    yield value;
  }
  if (error != null) {
    throw error;
  }
  return returned;
}

export async function* deferredGen<T>(
  values: T[],
  returned?: T,
  error?: any,
): AsyncIterableIterator<T> {
  for (const value of values) {
    await Promise.resolve();
    yield value;
  }
  if (error != null) {
    throw error;
  }
  return returned;
}

export async function* hangingGen<T = never>(): AsyncIterableIterator<T> {
  await new Promise(() => {});
  yield (Infinity as unknown) as T;
}

// Awaits a promise expected to reject and returns the rejection reason. Used
// instead of expect(p).rejects in timing-sensitive tests, because the bun test
// runner's .resolves/.rejects matchers insert different microtask ticks than a
// plain await, which shifts when a repeater's floating-rejection propagation
// lands relative to subsequent next() calls.
export async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }

  throw new Error("Expected promise to reject");
}

export function delayPromise<T>(
  wait: number,
  value?: T,
  error?: Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      if (error == null) {
        resolve(value!);
      } else {
        reject(error);
      }
    }, wait);
  });
}

export function delayRepeater<T>(
  wait: number,
  values: T[],
  returned?: T,
  error?: Error,
): Repeater<T> {
  return new Repeater<T>(async (push, stop) => {
    let i = 0;
    const timer = setInterval(() => {
      if (i >= values.length) {
        stop(error);
      }
      push(values[i++]);
    }, wait);
    await stop;
    clearInterval(timer);
    return returned;
  }, new FixedBuffer(values.length));
}
