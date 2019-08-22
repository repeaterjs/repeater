import { Repeater, FixedBuffer } from "./index";

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

export function delayPromise<T>(
  wait: number,
  value?: T,
  error?: Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      if (error == null) {
        resolve(value);
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
