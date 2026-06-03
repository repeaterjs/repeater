import { Repeater } from "./core.js";
import { safeRace } from "./_utils.js";

// These combinators race each iterator's next() against the stop promise using
// safeRace (a memory-safe Promise.race; see ./_utils.ts). stop resolves to
// undefined, which doubles as the signal to break out of the iteration loop.

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

    let finalIteration: IteratorReturnResult<unknown> | undefined;
    try {
      while (true) {
        // Re-pull every iterator each turn and take the fastest value, dropping
        // the others. A done observer is attached to every next() (not just the
        // race winner) so that any contender finishing stops the race and
        // records its return value, even one that never wins a value.
        const tagged = iters.map((iter) =>
          Promise.resolve(iter.next()).then(
            (iteration: IteratorResult<unknown>) => {
              if (iteration.done) {
                stop();
                if (finalIteration === undefined) {
                  finalIteration = iteration;
                }
              }

              return iteration;
            },
            (err) => {
              stop(err);
              return undefined;
            },
          ),
        );

        const iteration = await safeRace<any>([...tagged, stop]);
        // stop resolves to undefined; a rejected next resolves to undefined; a
        // done winner ends the race below.
        if (iteration === undefined || iteration.done) {
          break;
        }

        await push(iteration.value as any);
      }

      return finalIteration && finalIteration.value;
    } finally {
      stop();
      await safeRace(iters.map((iter) => iter.return && iter.return()));
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

    let finalIteration: IteratorReturnResult<unknown> | undefined;
    try {
      await Promise.all(
        iters.map(async (iter) => {
          try {
            while (true) {
              // Race this iterator's next value against stop. stop resolves to
              // undefined, which signals us to break out of the loop.
              let iteration: IteratorResult<unknown> | undefined;
              try {
                iteration = await safeRace([Promise.resolve(iter.next()), stop]);
              } catch (err) {
                stop(err);
                return;
              }

              if (iteration === undefined) {
                return;
              } else if (iteration.done) {
                finalIteration = iteration;
                return;
              }

              await push(iteration.value as any);
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

    try {
      while (true) {
        let iterations: Array<IteratorResult<unknown>> | undefined;
        try {
          iterations = await safeRace([
            Promise.all(iters.map((iter) => iter.next())),
            stop,
          ]);
        } catch (err) {
          stop(err);
          return;
        }

        // stop resolves to undefined.
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

    try {
      let iterations: Array<IteratorResult<unknown>> | undefined;
      try {
        iterations = await safeRace([
          Promise.all(iters.map((iter) => iter.next())),
          stop,
        ]);
      } catch (err) {
        stop(err);
        return;
      }

      // stop resolves to undefined.
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
          if (iterations![i].done) {
            return iterations![i].value;
          }

          while (true) {
            let iteration: IteratorResult<unknown> | undefined;
            try {
              iteration = await safeRace([
                Promise.resolve(iter.next()),
                stop,
              ]);
            } catch (err) {
              stop(err);
              return iterations![i].value;
            }

            if (iteration === undefined) {
              return iterations![i].value;
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
