import { FixedBuffer, RepeaterBuffer } from "./buffers";

export {
  DroppingBuffer,
  FixedBuffer,
  RepeaterBuffer,
  SlidingBuffer,
} from "./buffers";

export const MAX_QUEUE_LENGTH = 1024;

const NOOP = () => {};

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

export type Push<T, TNext = unknown> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;

export type Stop = ((error?: any) => undefined) & Promise<undefined>;

export type RepeaterExecutor<T, TReturn = any, TNext = unknown> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;

interface PushOperation<T, TNext> {
  resolve(next?: PromiseLike<TNext> | TNext): unknown;
  value: Promise<T | undefined>;
}

interface PullOperation<T, TReturn, TNext> {
  resolve(result: Promise<IteratorResult<T, TReturn>>): unknown;
  value?: PromiseLike<TNext> | TNext;
}

const enum RepeaterState {
  Initial,
  Started,
  Stopped,
  Finished,
  Rejected,
}

/**
 * The functionality for repeaters is implemented in this helper class and
 * hidden using a private WeakMap to make repeaters themselves opaque and
 * maximally compatible with async generators.
 */
class RepeaterController<T, TReturn = any, TNext = unknown>
  implements AsyncGenerator<T, TReturn, TNext> {
  private state: RepeaterState = RepeaterState.Initial;
  // pushQueue and pullQueue will never both contain operations at the same time.
  private pushQueue: PushOperation<T, TNext>[] = [];
  private pullQueue: PullOperation<T, TReturn, TNext>[] = [];
  // We continuously re-assign pending in push to make sure all results settle
  // in order. The pending promise will never reject.
  private pending?: Promise<any>;
  // execution is set to the return value of calling the executor and can be
  // re-assigned depending on whether stop, return or throw is called.
  private execution?: Promise<TReturn | undefined>;
  private error?: any;
  private onnext: (value?: PromiseLike<TNext> | TNext) => unknown = NOOP;
  private onstop: () => unknown = NOOP;
  constructor(
    private executor: RepeaterExecutor<T, TReturn, TNext>,
    private buffer: RepeaterBuffer,
  ) {}

  /**
   * This method runs synchronously the first time next is called.
   *
   * Advances state to RepeaterState.Started
   */
  private execute(): void {
    if (this.state >= RepeaterState.Started) {
      return;
    }

    this.state = RepeaterState.Started;
    const push: Push<T, TNext> = this.push.bind(this);
    const stop: Stop = this.stop.bind(this) as any;
    {
      const stopP = new Promise<undefined>(
        (resolve) => (this.onstop = resolve),
      );
      stop.then = stopP.then.bind(stopP);
      stop.catch = stopP.catch.bind(stopP);
      stop.finally = stopP.finally.bind(stopP);
    }

    try {
      this.execution = Promise.resolve(this.executor(push, stop));
    } catch (error) {
      // sync error in executor
      this.execution = Promise.reject(error);
    }

    // We don’t have to call this.stop with the error because all that does is
    // reassign this.execution with the rejection.
    this.execution.catch(() => this.stop());
  }

  /**
   * A helper method which builds IteratorResult objects from values.  This
   * method prevents types of Repeater<Promise<any>>, where the value property
   * is a promise, and mimics the promise unwrapping behavior of async
   * generators, where yield is equivalent to yield await.
   */
  private unwrap(
    value?: PromiseLike<T | TReturn | undefined> | T | TReturn,
  ): Promise<IteratorResult<T, TReturn>> {
    const done = this.state >= RepeaterState.Finished;
    return Promise.resolve(value).then((value: any) => {
      if (!done && this.state >= RepeaterState.Rejected) {
        return this.consume().then((value: any) => ({ value, done: true }));
      }

      return { value, done };
    });
  }

  /**
   * A helper method used to mimic the behavior of async generators where the
   * final result or any error are consumed, so that further calls to next,
   * return or throw return { done: true }.
   */
  private consume(): Promise<TReturn | undefined> {
    const error = this.error;
    const execution = Promise.resolve(this.execution).then((value) => {
      if (error != null) {
        throw error;
      }

      return value;
    });
    this.error = undefined;
    this.execution = execution.then(() => undefined, () => undefined);
    return this.pending === undefined
      ? execution
      : this.pending.then(() => execution);
  }

  /**
   * The difference between stopping a repeater vs finishing a repeater is that
   * stopping a repeater allows next to continue to drain values from the
   * pushQueue and buffer, while finishing a repeater will clear all pending
   * values and end iteration immediately. Once, a repeater is finished, all
   * results will have the done property set to true.
   *
   * Advances state to RepeaterState.Finished
   */
  private finish(): void {
    if (this.state >= RepeaterState.Finished) {
      return;
    }

    if (this.state < RepeaterState.Stopped) {
      this.stop();
    }

    this.state = RepeaterState.Finished;
    this.pushQueue = [];
    this.buffer = new FixedBuffer(0);
  }

  /**
   * Called when a promise passed to push rejects, or when a push call is
   * unhandled.
   *
   * Advances state to RepeaterState.Rejected
   */
  private reject(): void {
    if (this.state >= RepeaterState.Rejected) {
      return;
    }

    if (this.state < RepeaterState.Finished) {
      this.finish();
    }

    this.state = RepeaterState.Rejected;
  }

  /**
   * This method is bound and passed to the executor as the push argument.
   */
  private push(value: PromiseLike<T> | T): Promise<TNext | undefined> {
    Promise.resolve(value).catch(NOOP);
    if (this.pushQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
      );
    } else if (this.state >= RepeaterState.Stopped) {
      return Promise.resolve(undefined);
    }

    let valueP: Promise<T | undefined> =
      this.pending === undefined
        ? Promise.resolve(value)
        : this.pending.then(() => value);
    valueP = valueP.catch((error) => {
      if (this.state < RepeaterState.Stopped) {
        this.error = error;
      }

      this.reject();
      return undefined;
    });

    let next: Promise<TNext | undefined>;
    if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      pull.resolve(this.unwrap(valueP));
      if (this.pullQueue.length) {
        next = Promise.resolve(this.pullQueue[0].value);
      } else {
        next = new Promise((resolve) => (this.onnext = resolve));
      }
    } else if (!this.buffer.full) {
      this.buffer.add(valueP);
      next = Promise.resolve(undefined);
    } else {
      next = new Promise((resolve) => {
        this.pushQueue.push({ resolve, value: valueP });
      });
    }

    // This method of catching unhandled rejections is adapted from
    // https://stackoverflow.com/a/57792542/1825413
    let floating = true;
    let error: any;
    const unhandled = next.catch((error1) => {
      if (floating) {
        error = error1;
      }
    });
    next.then = function(onFulfilled, onRejected): Promise<any> {
      floating = false;
      return Promise.prototype.then.call(this, onFulfilled, onRejected);
    };
    this.pending = valueP
      .then(() => unhandled)
      .then(() => {
        if (error != null) {
          this.error = error;
          this.reject();
        }
      });
    return next;
  }

  /**
   * This method is bound and passed to the executor as the stop argument.
   *
   * Advances state to RepeaterState.Stopped
   */
  private stop(error?: any): void {
    if (this.state >= RepeaterState.Stopped) {
      return;
    }

    this.state = RepeaterState.Stopped;
    this.onnext();
    this.onstop();
    if (this.error == null) {
      this.error = error;
    }

    for (const push of this.pushQueue) {
      push.resolve();
    }

    // If the pullQueue contains operations, the pushQueue and buffer are both
    // necessarily empty, so we don‘t have to worry about this.finish clearing
    // the pushQueue or buffer.
    if (this.pullQueue.length) {
      this.finish();
      for (const pull of this.pullQueue) {
        const execution: Promise<TReturn | undefined> =
          this.pending === undefined
            ? this.consume()
            : this.pending.then(() => this.consume());
        pull.resolve(this.unwrap(execution));
      }
    }

    this.pullQueue = [];
  }

  next(
    value?: PromiseLike<TNext> | TNext,
  ): Promise<IteratorResult<T, TReturn>> {
    Promise.resolve(value).catch(NOOP);
    if (this.pullQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Repeater.prototype.next are allowed on a single repeater.`,
      );
    }

    if (this.state <= RepeaterState.Initial) {
      this.execute();
    }

    this.onnext(value);
    if (!this.buffer.empty) {
      const result = this.unwrap(this.buffer.remove() as any);
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
      this.finish();
      return this.unwrap(this.consume());
    }

    return new Promise((resolve) => this.pullQueue.push({ resolve, value }));
  }

  return(
    value?: PromiseLike<TReturn> | TReturn,
  ): Promise<IteratorResult<T, TReturn>> {
    Promise.resolve(value).catch(NOOP);
    this.finish();
    this.execution = Promise.resolve(this.execution).then(() => value);
    return this.unwrap(this.consume());
  }

  throw(error: any): Promise<IteratorResult<T, TReturn>> {
    if (
      this.state <= RepeaterState.Initial ||
      this.state >= RepeaterState.Stopped ||
      !this.buffer.empty
    ) {
      this.finish();
      if (this.error == null) {
        this.error = error;
      }

      return this.unwrap(this.consume());
    }

    return this.next(Promise.reject(error));
  }

  [Symbol.asyncIterator](): this {
    return this;
  }
}

const controllers = new WeakMap<
  Repeater<any, any, any>,
  RepeaterController<any, any, any>
>();

// We do not export any types which use >=3.6 IteratorResult, AsyncIterator or
// AsyncGenerator types. This allows the code to be used with older versions of
// typescript. We cannot implement `AsyncIterator` or `AsyncIterableIterator`
// here because the default types are busted as hell.
//
// TODO: use typesVersions to ship stricter types.
export class Repeater<T, TReturn = any, TNext = unknown> {
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>,
    buffer: RepeaterBuffer = new FixedBuffer(0),
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
  return new Repeater<T>(async (push, stop) => {
    const iters = iterators(contenders);
    if (!iters.length) {
      stop();
      return;
    }

    let stopped = false;
    stop.then(() => (stopped = true));
    try {
      let returned: any;
      while (!stopped) {
        const results = iters.map((iter) => iter.next());
        for (const result of results) {
          Promise.resolve(result).then(
            (result) => {
              if (result.done && !stopped) {
                stop();
                returned = result.value;
              }
            },
            (error) => stop(error),
          );
        }

        const result = await Promise.race([...results, stop]);
        if (result !== undefined && !result.done) {
          await push(result.value);
        }
      }

      return returned;
    } catch (error) {
      stop(error);
    } finally {
      stop();
      await Promise.race(iters.map((iter) => iter.return && iter.return()));
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
  return new Repeater<T>(async (push, stop) => {
    const iters = iterators(contenders);
    if (!iters.length) {
      stop();
      return;
    }

    let stopped = false;
    stop.then(() => (stopped = true));
    let returned: any;
    await Promise.all(
      iters.map(async (iter) => {
        try {
          while (!stopped) {
            const result = await Promise.race([iter.next(), stop]);
            if (result !== undefined) {
              if (result.done) {
                returned = result.value;
                return;
              }

              await push(result.value);
            }
          }
        } catch (error) {
          stop(error);
        } finally {
          if (iter.return) {
            await iter.return();
          }
        }
      }),
    );
    stop();
    return returned;
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
    stop.then(() => (stopped = true));
    try {
      while (!stopped) {
        const resultsP = Promise.all(iters.map((iter) => iter.next()));
        const results = await Promise.race([resultsP, stop]);
        if (results === undefined) {
          break;
        }

        const values = results.map((result) => result.value);
        if (results.some((result) => result.done)) {
          return values;
        }

        await push(values);
      }
    } catch (error) {
      stop(error);
    } finally {
      stop();
      await Promise.all(iters.map((iter) => iter.return && iter.return()));
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
    stop.then(() => (stopped = true));
    const resultsP = Promise.all(iters.map((iter) => iter.next()));
    const results = await Promise.race([stop, resultsP]);
    if (results === undefined) {
      return Promise.all(
        iters.map(async (iter) => {
          if (iter.return === undefined) {
            return;
          }

          return (await iter.return()).value;
        }),
      );
    }

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
            const result = await Promise.race([stop, iter.next()]);
            if (result !== undefined) {
              if (result.done) {
                return result.value;
              }

              values[i] = result.value;
              await push(values.slice());
            }
          }
        } catch (error) {
          stop(error);
        } finally {
          if (iter.return) {
            await iter.return();
          }
        }
      }),
    );
    stop();
    return result;
  });
}
