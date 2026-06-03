import { Repeater } from "./core.js";

// NOTE: whenever you see any variables called `advance` or `advances`, know
// that it is a hack to get around the fact that `Promise.race` leaks memory.
// These variables are intended to be set to the resolve function of a promise
// which is constructed and awaited as an alternative to Promise.race. For more
// information, see: https://github.com/nodejs/node/issues/17469#issuecomment-685216777

function getIterators(
  values: Iterable<any>,
  options: { yieldValues?: boolean; returnValues?: boolean },
): Array<AsyncIterator<any> | Iterator<any>> {
  const iters: Array<AsyncIterator<any> | Iterator<any>> = [];
  for (const value of values) {
    if (value != null && typeof value[Symbol.asyncIterator] === "function") {
      iters.push((value as AsyncIterable<any>)[Symbol.asyncIterator]());
    } else if (value != null && typeof value[Symbol.iterator] === "function") {
      iters.push((value as Iterable<any>)[Symbol.iterator]());
    } else {
      iters.push(
        (async function* valueToAsyncIterator() {
          if (options.yieldValues) {
            yield value;
          }

          if (options.returnValues) {
            return value;
          }
        })(),
      );
    }
  }

  return iters;
}

export function race<T>(
  contenders: Iterable<T>,
): Repeater<
  T extends AsyncIterable<infer U> | Iterable<infer U>
    ? U extends PromiseLike<infer V>
      ? V
      : U
    : never
> {
  const iters = getIterators(contenders, { returnValues: true });
  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return;
    }

    let advance!: (value?: IteratorYieldResult<unknown>) => unknown;
    let stopped = false;
    stop.then(() => {
      advance();
      stopped = true;
    });

    let finalIteration: IteratorReturnResult<unknown> | undefined;
    try {
      let iteration: IteratorYieldResult<unknown> | undefined;
      let i = 0;
      while (!stopped) {
        const j = i;
        for (const iter of iters) {
          Promise.resolve(iter.next()).then(
            (iteration) => {
              if (iteration.done) {
                stop();
                if (finalIteration === undefined) {
                  finalIteration = iteration;
                }
              } else if (i === j) {
                i++;
                advance(iteration);
              }
            },
            (err) => stop(err),
          );
        }

        iteration = await new Promise((resolve) => (advance = resolve));
        if (iteration !== undefined) {
          await push(iteration.value as any);
        }
      }

      return finalIteration && finalIteration.value;
    } finally {
      stop();
      await Promise.race(iters.map((iter) => iter.return && iter.return()));
    }
  });
}

export function merge<T>(
  contenders: Iterable<T>,
): Repeater<
  T extends AsyncIterable<infer U> | Iterable<infer U>
    ? U extends PromiseLike<infer V>
      ? V
      : U
    : T extends PromiseLike<infer U>
    ? U
    : T
> {
  const iters = getIterators(contenders, { yieldValues: true });
  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return;
    }

    const advances: Array<(value?: IteratorResult<unknown>) => unknown> = [];
    let stopped = false;
    stop.then(() => {
      stopped = true;
      for (const advance of advances) {
        advance();
      }
    });

    let finalIteration: IteratorReturnResult<unknown> | undefined;
    try {
      await Promise.all(
        iters.map(async (iter, i) => {
          try {
            while (!stopped) {
              Promise.resolve(iter.next()).then(
                (iteration) => advances[i](iteration),
                (err) => stop(err),
              );
              const iteration:
                | IteratorResult<unknown>
                | undefined = await new Promise((resolve) => {
                advances[i] = resolve;
              });

              if (iteration !== undefined) {
                if (iteration.done) {
                  finalIteration = iteration;
                  return;
                }

                await push(iteration.value as any);
              }
            }
          } finally {
            iter.return && (await iter.return());
          }
        }),
      );
      return finalIteration && finalIteration.value;
    } finally {
      stop();
    }
  });
}

type Contender<T> =
  | AsyncIterable<Promise<T> | T>
  | Iterable<Promise<T> | T>
  | PromiseLike<T>
  | T;

export function zip(contenders: []): Repeater<never>;
export function zip<T>(contenders: Iterable<Contender<T>>): Repeater<[T]>;
// prettier-ignore
export function zip<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<[T1, T2]>;
// prettier-ignore
export function zip<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<[T1, T2, T3]>;
// prettier-ignore
export function zip<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<[T1, T2, T3, T4]>;
// prettier-ignore
export function zip<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<[T1, T2, T3, T4, T5]>;
// prettier-ignore
export function zip<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<[T1, T2, T3, T4, T5, T6]>;
// prettier-ignore
export function zip<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<[T1, T2, T3, T4, T5, T6, T7]>;
// prettier-ignore
export function zip<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8]>;
// prettier-ignore
export function zip<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
// prettier-ignore
export function zip<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
export function zip(contenders: Iterable<any>) {
  const iters = getIterators(contenders, { returnValues: true });
  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return [];
    }

    let advance!: (iterations?: Array<IteratorResult<unknown>>) => unknown;
    let stopped = false;
    stop.then(() => {
      advance();
      stopped = true;
    });

    try {
      while (!stopped) {
        Promise.all(iters.map((iter) => iter.next())).then(
          (iterations) => advance(iterations),
          (err) => stop(err),
        );

        const iterations:
          | Array<IteratorResult<unknown>>
          | undefined = await new Promise((resolve) => (advance = resolve));
        if (iterations === undefined) {
          return;
        }

        const values = iterations.map((iteration) => iteration.value);
        if (iterations.some((iteration) => iteration.done)) {
          return values;
        }

        await push(values);
      }
    } finally {
      stop();
      await Promise.all(iters.map((iter) => iter.return && iter.return()));
    }
  });
}

export function latest(contenders: []): Repeater<never>;
export function latest<T>(contenders: Iterable<Contender<T>>): Repeater<[T]>;
// prettier-ignore
export function latest<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<[T1, T2]>;
// prettier-ignore
export function latest<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<[T1, T2, T3]>;
// prettier-ignore
export function latest<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<[T1, T2, T3, T4]>;
// prettier-ignore
export function latest<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<[T1, T2, T3, T4, T5]>;
// prettier-ignore
export function latest<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<[T1, T2, T3, T4, T5, T6]>;
// prettier-ignore
export function latest<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<[T1, T2, T3, T4, T5, T6, T7]>;
// prettier-ignore
export function latest<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8]>;
// prettier-ignore
export function latest<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
// prettier-ignore
export function latest<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
export function latest(contenders: Iterable<any>) {
  const iters = getIterators(contenders, {
    yieldValues: true,
    returnValues: true,
  });

  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return [];
    }

    let advance!: (iterations?: Array<IteratorResult<unknown>>) => unknown;
    const advances: Array<(
      iteration?: IteratorResult<unknown>,
    ) => unknown> = [];
    let stopped = false;
    stop.then(() => {
      advance();
      for (const advance1 of advances) {
        advance1();
      }
      stopped = true;
    });

    try {
      Promise.all(iters.map((iter) => iter.next())).then(
        (iterations) => advance(iterations),
        (err) => stop(err),
      );

      const iterations:
        | Array<IteratorResult<unknown>>
        | undefined = await new Promise((resolve) => (advance = resolve));
      if (iterations === undefined) {
        return;
      }

      const values = iterations.map((iteration) => iteration.value);
      if (iterations.every((iteration) => iteration.done)) {
        return values;
      }

      await push(values.slice());
      return await Promise.all(
        iters.map(async (iter, i) => {
          if (iterations[i].done) {
            return iterations[i].value;
          }

          while (!stopped) {
            Promise.resolve(iter.next()).then(
              (iteration) => advances[i](iteration),
              (err) => stop(err),
            );

            const iteration:
              | IteratorResult<unknown>
              | undefined = await new Promise(
              (resolve) => (advances[i] = resolve),
            );
            if (iteration === undefined) {
              return iterations[i].value;
            } else if (iteration.done) {
              return iteration.value;
            }

            values[i] = iteration.value;
            await push(values.slice());
          }
        }),
      );
    } finally {
      stop();
      await Promise.all(iters.map((iter) => iter.return && iter.return()));
    }
  });
}
