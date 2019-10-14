import { FixedBuffer, RepeaterBuffer } from "./buffers";

export {
  DroppingBuffer,
  FixedBuffer,
  RepeaterBuffer,
  SlidingBuffer,
} from "./buffers";

export const MAX_QUEUE_LENGTH = 1024;

export class RepeaterOverflowError extends Error {
  constructor(message: string) {
    super(message);
    Object.defineProperty(this, "name", {
      value: "RepeaterOverflowError",
      enumerable: false,
    });
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, new.target.prototype);
    } else {
      (this as any).__proto__ = new.target.prototype;
    }

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export type Push<T, TNext = any> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;

export type Stop = Promise<void> & ((error?: any) => void);

export type RepeaterExecutor<T, TReturn = any, TNext = any> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;

interface PushOperation<T, TNext> {
  resolve(next?: PromiseLike<TNext> | TNext): void;
  value: PromiseLike<T> | T;
}

interface PullOperation<T, TReturn, TNext> {
  resolve(result: Promise<IteratorResult<T, TReturn>>): void;
  reject(err?: any): void;
  value?: PromiseLike<TNext> | TNext;
}

const enum RepeaterState {
  Initial,
  Started,
  Stopped,
  Finished,
}

/**
 * The functionality for repeaters is implemented in this helper class and
 * hidden using a private WeakMap to make repeaters themselves opaque and
 * maximally compatible with async generators.
 */
class RepeaterController<T, TReturn = any, TNext = any>
  implements AsyncGenerator<T, TReturn, TNext> {
  private state: RepeaterState = RepeaterState.Initial;
  // pushQueue and pullQueue will never both contain operations at the same time
  private pushQueue: PushOperation<T, TNext>[] = [];
  private pullQueue: PullOperation<T, TReturn, TNext>[] = [];
  private execution?: Promise<TReturn>;
  private error?: any;
  // pending is continuously reassigned as the repeater is iterated. We use
  // this mechanism to make sure all iterations settle in order.
  private pending?: Promise<IteratorResult<T, TReturn>>;
  private onnext?: (value?: PromiseLike<TNext> | TNext) => void;
  private onthrow?: (err: any) => void;
  private onstop?: () => void;
  constructor(
    private executor: RepeaterExecutor<T, TReturn, TNext>,
    private buffer: RepeaterBuffer<T>,
  ) {}

  /**
   * This method runs synchronously the first time next is called.
   *
   * Advances state to RepeaterState.Started.
   */
  private execute(): void {
    if (this.state >= RepeaterState.Started) {
      return;
    }

    this.state = RepeaterState.Started;
    const push: Push<T, TNext> = this.push.bind(this);
    const stop: Stop = this.stop.bind(this) as any;
    const stopP = new Promise<void>((resolve) => (this.onstop = resolve));
    stop.then = stopP.then.bind(stopP);
    stop.catch = stopP.catch.bind(stopP);
    stop.finally = stopP.finally.bind(stopP);
    try {
      this.execution = Promise.resolve(this.executor(push, stop));
    } catch (err) {
      this.execution = Promise.reject(err);
    }

    // Errors which occur in the executor take precedence over those passed to
    // this.stop, so calling this.stop with the caught error would be redundant.
    this.execution.catch(() => this.stop());
  }

  /**
   * A helper method which is called when a promise passed to push rejects.
   * Rejections which settle after stop are ignored. This behavior is useful
   * when you push a pending promise but want to finish instead.
   */
  private reject(error: any): Promise<IteratorResult<T, TReturn>> {
    if (this.state >= RepeaterState.Stopped) {
      // We can’t call this.finish because we are already within an assignment
      // this.pending. Trying to call this.finish will reassign this.pending
      // and cause the result to hang.
      // TODO: abstract duplicate code between this and finish
      const execution = Promise.resolve(this.execution!);
      const error = this.error;
      delete this.execution;
      delete this.error;
      this.state = RepeaterState.Finished;
      return execution.then((value) => {
        if (error == null) {
          return { value, done: true };
        }

        throw error;
      });
    }

    this.finish().catch(() => {});
    return Promise.reject(error);
  }

  /**
   * A helper method which unwraps promises passed to push. Unwrapping promises
   * prevents types of Repeater<Promise<any>> and mimics the awaiting/unwrapping
   * behavior of async generators where `yield` is equivalent to `yield await`.
   */
  private unwrap(
    value: PromiseLike<T> | T,
  ): Promise<IteratorResult<T, TReturn>> {
    if (this.pending === undefined) {
      this.pending = Promise.resolve(value).then(
        (value) => {
          return { value, done: false };
        },
        (err) => this.reject(err),
      );
    } else {
      this.pending = this.pending.then(
        (prev) => {
          if (prev.done) {
            return { done: true } as IteratorResult<T, TReturn>;
          }

          return Promise.resolve(value).then(
            (value) => ({ value, done: false }),
            (err) => this.reject(err),
          );
        },
        () => ({ done: true } as IteratorResult<T, TReturn>),
      );
    }

    return this.pending;
  }

  /**
   * A helper method which “consumes” the final iteration of the repeater,
   * mimicking the returning/throwing behavior of generators.
   *
   * The difference between stopping a repeater vs finishing a repeater is that
   * stopping a repeater allows next to continue draining values from the
   * pushQueue/buffer, while finishing a repeater will clear all queues/buffers
   * and end all iteration.
   *
   * Advances state to RepeaterState.Finished.
   */
  private finish(): Promise<IteratorResult<T, TReturn>> {
    const execution = Promise.resolve(this.execution!);
    const error = this.error;
    delete this.execution;
    delete this.error;
    if (this.state < RepeaterState.Finished) {
      if (this.state < RepeaterState.Stopped) {
        this.stop();
      }

      this.state = RepeaterState.Finished;
      this.pushQueue = [];
      this.buffer = new FixedBuffer(0);
    }

    if (this.pending === undefined) {
      this.pending = execution.then((value) => {
        if (error == null) {
          return { value, done: true };
        }

        throw error;
      });
    } else {
      this.pending = this.pending.then(
        () =>
          execution.then((value) => {
            if (error == null) {
              return { value, done: true };
            }

            throw error;
          }),
        () => ({ done: true } as IteratorResult<T, TReturn>),
      );
    }

    return this.pending;
  }

  /**
   * This method is bound and passed to the executor as `push`.
   */
  private push(value: PromiseLike<T> | T): Promise<TNext | undefined> {
    Promise.resolve(value).catch(() => {});
    if (this.state >= RepeaterState.Stopped) {
      return Promise.resolve(undefined);
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      pull.resolve(this.unwrap(value));
      if (this.pullQueue.length) {
        return Promise.resolve(this.pullQueue[0].value);
      }

      return new Promise((resolve) => (this.onnext = resolve));
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve(undefined);
    } else if (this.pushQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
      );
    }

    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
  }

  /**
   * This method is bound and passed to the executor as `stop`.
   *
   * Advances state to RepeaterState.Stopped.
   */
  private stop(error?: any): void {
    if (this.state >= RepeaterState.Stopped) {
      return;
    }

    this.state = RepeaterState.Stopped;
    if (this.onnext !== undefined) {
      this.onnext();
      delete this.onnext;
      delete this.onthrow;
    }

    if (this.onstop !== undefined) {
      this.onstop();
      delete this.onstop;
    }

    this.error = error;
    for (const push of this.pushQueue) {
      push.resolve();
    }

    // If the pullQueue contains operations, the pushQueue and buffer is
    // necessarily empty, so we don‘t have to worry about this.finish clearing
    // the pushQueue or buffer.
    for (const pull of this.pullQueue) {
      pull.resolve(this.finish());
    }

    this.pullQueue = [];
  }

  next(
    value?: PromiseLike<TNext> | TNext,
  ): Promise<IteratorResult<T, TReturn>> {
    if (this.state === RepeaterState.Initial) {
      this.execute();
    }

    if (this.onnext !== undefined) {
      this.onnext(value);
    }

    if (!this.buffer.empty) {
      const result = this.unwrap(this.buffer.remove());
      if (this.pushQueue.length) {
        const push = this.pushQueue.shift()!;
        this.buffer.add(push.value);
        this.onnext = push.resolve;
      }

      return result;
    } else if (this.pushQueue.length) {
      const push = this.pushQueue.shift()!;
      this.onnext = push.resolve;
      return this.unwrap(push.value);
    } else if (this.state >= RepeaterState.Stopped) {
      return this.finish();
    } else if (this.pullQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Repeater.prototype.next are allowed on a single repeater.`,
      );
    }

    return new Promise((resolve, reject) => {
      this.pullQueue.push({ resolve, reject, value });
    });
  }

  return(
    value?: PromiseLike<TReturn> | TReturn,
  ): Promise<IteratorResult<T, TReturn>> {
    this.execution = Promise.resolve(this.execution).then(
      () => value!,
      () => value!,
    );
    return this.finish();
  }

  throw(error: any): Promise<IteratorResult<T, TReturn>> {
    if (this.state >= RepeaterState.Finished) {
      if (this.pending === undefined) {
        this.pending = Promise.reject(error);
      } else {
        this.pending = this.pending.then(
          () => Promise.reject(error),
          () => Promise.reject(error),
        );
      }

      return this.pending;
    }

    this.stop(error);
    return this.finish();
  }

  [Symbol.asyncIterator](): this {
    return this;
  }
}

const controllers = new WeakMap<
  Repeater<any, any, any>,
  RepeaterController<any, any, any>
>();

// We do not export any types which use the >=3.6 IteratorResult, AsyncIterator
// or AsyncGenerator types to allow the library to be used with older versions
// of typescript.
//
// TODO: use typesVersions to ship stricter types for newer typescript
// versions.
export class Repeater<T, TReturn = any, TNext = any> {
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>,
    buffer: RepeaterBuffer<T> = new FixedBuffer(0),
  ) {
    controllers.set(this, new RepeaterController(executor, buffer));
  }

  next(value?: PromiseLike<TNext> | TNext): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller === undefined) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.next(value);
  }

  return(value?: PromiseLike<TReturn> | TReturn): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller === undefined) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.return(value);
  }

  throw(error?: any): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller === undefined) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.throw(error);
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  static race = race;
  static merge = merge;
  static zip = zip;
  static latest = latest;
}

// TODO: parameterize TReturn
type Contender<T> = AsyncIterable<T> | Iterable<T> | PromiseLike<any>;

function iterators<T>(
  contenders: Iterable<Contender<T>>,
): (AsyncIterator<T> | Iterator<T>)[] {
  const iters: (AsyncIterator<T> | Iterator<T>)[] = [];
  for (const contender of contenders) {
    if (typeof (contender as any)[Symbol.asyncIterator] === "function") {
      iters.push((contender as AsyncIterable<T>)[Symbol.asyncIterator]());
    } else if (typeof (contender as any)[Symbol.iterator] === "function") {
      iters.push((contender as Iterable<T>)[Symbol.iterator]());
    } else {
      iters.push(new Repeater((_, stop) => (stop(), contender)));
    }
  }

  return iters;
}

// TODO: rethink the done value for each of the combinators
// TODO: parameterize TReturn types
// TODO: use prettier-ignore-start/prettier-ignore-end once it’s implemented
// https://github.com/prettier/prettier/issues/5287
// TODO: stop using overloads once we have variadic kinds
// https://github.com/Microsoft/TypeScript/issues/5453
function race(contenders: []): Repeater<never>;
function race<T>(contenders: Iterable<Contender<T>>): Repeater<T>;
// prettier-ignore
function race<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<T1 | T2>;
// prettier-ignore
function race<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<T1 | T2 | T3>;
// prettier-ignore
function race<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<T1 | T2 | T3 | T4>;
// prettier-ignore
function race<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<T1 | T2 | T3 | T4 | T5>;
// prettier-ignore
function race<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6>;
// prettier-ignore
function race<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7>;
// prettier-ignore
function race<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
// prettier-ignore
function race<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
// prettier-ignore
function race<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
function race<T>(contenders: Iterable<Contender<T>>): Repeater<T> {
  const iters = iterators(contenders);
  return new Repeater<T>(async (push, stop) => {
    if (!iters.length) {
      stop();
      return;
    }

    let stopped = false;
    let returned: any;
    const finish: Promise<IteratorResult<T>> = stop.then((value) => {
      stopped = true;
      returned = value;
      return { value, done: true };
    });
    try {
      let result: IteratorResult<T> | undefined;
      while (!stopped) {
        const results = iters.map((iter) => iter.next());
        for (const result1 of results) {
          Promise.resolve(result1)
            .then((result1) => {
              if (result === undefined && result1.done) {
                stop();
                result = result1;
              }
            })
            .catch(stop);
        }

        results.unshift(finish);
        const result1 = await Promise.race(results);
        if (result === undefined && result1.done) {
          result = result1;
          break;
        }

        await push(result1.value as T);
      }

      return result && result.value;
    } catch (err) {
      stop(err);
    } finally {
      stop();
      await Promise.race<any>(
        iters.map((iter) => iter.return && iter.return(returned)),
      );
    }
  });
}

function merge(contenders: []): Repeater<never>;
function merge<T>(contenders: Iterable<Contender<T>>): Repeater<T>;
// prettier-ignore
function merge<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<T1 | T2>;
// prettier-ignore
function merge<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<T1 | T2 | T3>;
// prettier-ignore
function merge<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<T1 | T2 | T3 | T4>;
// prettier-ignore
function merge<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<T1 | T2 | T3 | T4 | T5>;
// prettier-ignore
function merge<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6>;
// prettier-ignore
function merge<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7>;
// prettier-ignore
function merge<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
// prettier-ignore
function merge<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
// prettier-ignore
function merge<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
function merge<T>(contenders: Iterable<Contender<T>>): Repeater<T> {
  // need to pass type parameter here for some reason
  const iters = iterators(contenders);
  return new Repeater<T>(async (push, stop) => {
    if (!iters.length) {
      stop();
      return;
    }

    let stopped = false;
    let returned: any;
    const finish: Promise<IteratorResult<T>> = stop.then((value) => {
      stopped = true;
      returned = value;
      return { value, done: true };
    });
    let value: any | undefined;
    await Promise.all(
      iters.map(async (iter) => {
        try {
          while (!stopped) {
            const result: IteratorResult<T> = await Promise.race([
              finish,
              iter.next(),
            ]);
            if (result.done) {
              value = result.value;
              return;
            }

            await push(result.value as T);
          }
        } catch (err) {
          stop(err);
        } finally {
          if (iter.return) {
            await iter.return(returned);
          }
        }
      }),
    );
    stop();
    return value;
  });
}

function zip(contenders: []): Repeater<never, []>;
function zip<T>(contenders: Iterable<Contender<T>>): Repeater<T[]>;
// prettier-ignore
function zip<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<[T1, T2]>;
// prettier-ignore
function zip<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<[T1, T2, T3]>;
// prettier-ignore
function zip<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<[T1, T2, T3, T4]>;
// prettier-ignore
function zip<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<[T1, T2, T3, T4, T5]>;
// prettier-ignore
function zip<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<[T1, T2, T3, T4, T5, T6]>;
// prettier-ignore
function zip<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<[T1, T2, T3, T4, T5, T6, T7]>;
// prettier-ignore
function zip<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8]>;
// prettier-ignore
function zip<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
// prettier-ignore
function zip<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
function zip<T>(contenders: Iterable<Contender<T>>): Repeater<T[]> {
  const iters = iterators(contenders);
  return new Repeater<T[]>(async (push, stop) => {
    if (!iters.length) {
      stop();
      return [];
    }

    let stopped = false;
    let returned: any;
    stop.then((value) => {
      stopped = true;
      returned = value;
    });
    try {
      while (!stopped) {
        const resultsP = Promise.all(iters.map((iter) => iter.next()));
        await Promise.race([stop, resultsP]);
        if (stopped) {
          return Promise.all(
            iters.map(async (iter) => {
              if (iter.return === undefined) {
                return returned;
              }
              return (await iter.return(returned)).value;
            }),
          );
        }

        const results = await resultsP;
        const values = results.map((result) => result.value);
        if (results.some((result) => result.done)) {
          return values;
        }

        await push(values);
      }
    } catch (err) {
      stop(err);
    } finally {
      stop();
      if (!stopped) {
        await Promise.all<any>(
          iters.map((iter) => iter.return && iter.return(returned)),
        );
      }
    }
  });
}

function latest(contenders: []): Repeater<never, []>;
function latest<T>(contenders: Iterable<Contender<T>>): Repeater<T[]>;
// prettier-ignore
function latest<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<[T1, T2]>;
// prettier-ignore
function latest<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<[T1, T2, T3]>;
// prettier-ignore
function latest<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<[T1, T2, T3, T4]>;
// prettier-ignore
function latest<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<[T1, T2, T3, T4, T5]>;
// prettier-ignore
function latest<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<[T1, T2, T3, T4, T5, T6]>;
// prettier-ignore
function latest<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<[T1, T2, T3, T4, T5, T6, T7]>;
// prettier-ignore
function latest<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8]>;
// prettier-ignore
function latest<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
// prettier-ignore
function latest<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
function latest<T>(contenders: Iterable<Contender<T>>): Repeater<T[]> {
  const iters = iterators(contenders);
  return new Repeater<T[]>(async (push, stop) => {
    if (!iters.length) {
      stop();
      return [];
    }

    let stopped = false;
    let returned: any;
    const finish = stop.then((value) => {
      stopped = true;
      returned = value;
      return { value, done: true };
    });
    const resultsP = Promise.all(iters.map((iter) => iter.next()));
    await Promise.race([stop, resultsP]);
    if (stopped) {
      return Promise.all(
        iters.map(async (iter) => {
          if (iter.return === undefined) {
            return returned;
          }
          return (await iter.return(returned)).value;
        }),
      );
    }

    const results = await resultsP;
    const values = results.map((result) => result.value);
    if (results.every((result) => result.done)) {
      return values;
    }

    await push(values.slice());
    const result = await Promise.all(
      iters.map(async (iter, i) => {
        if (results[i].done) {
          return results[i].value;
        }
        try {
          while (!stopped) {
            const result = await Promise.race([finish, iter.next()]);
            if (result.done) {
              return result.value;
            }

            values[i] = result.value;
            await push(values.slice());
          }
        } catch (err) {
          stop(err);
        } finally {
          if (iter.return) {
            await iter.return(returned);
          }
        }
      }),
    );
    stop();
    return result;
  });
}
