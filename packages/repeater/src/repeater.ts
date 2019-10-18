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

export type Stop = Promise<undefined> & ((error?: any) => undefined);

export type RepeaterExecutor<T, TReturn = any, TNext = any> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;

interface PushOperation<T, TNext> {
  resolve(next?: PromiseLike<TNext> | TNext): unknown;
  value: PromiseLike<T> | T;
}

interface PullOperation<T, TReturn, TNext> {
  resolve(result: PromiseLike<IteratorResult<T, TReturn>>): unknown;
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
  // pushQueue and pullQueue will never both contain operations at the same time.
  private pushQueue: PushOperation<T, TNext>[] = [];
  private pullQueue: PullOperation<T, TReturn, TNext>[] = [];
  // pending is continuously re-assigned as the repeater is iterated.
  // We use this mechanism to make sure all iterations settle in order.
  private pending?: Promise<T | TReturn | undefined>;
  // execution is set to the return value of calling the executor and can be
  // re-assigned depending on whether stop, return or throw is called.
  private execution?: Promise<TReturn | undefined>;
  private onnext?: (value?: PromiseLike<TNext> | TNext) => unknown;
  private onstop?: () => unknown;
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
    const stopP = new Promise<undefined>((resolve) => (this.onstop = resolve));
    stop.then = stopP.then.bind(stopP);
    stop.catch = stopP.catch.bind(stopP);
    stop.finally = stopP.finally.bind(stopP);
    let execution: Promise<TReturn | undefined>;
    try {
      execution = Promise.resolve(this.executor(push, stop));
    } catch (error) {
      // sync error in executor
      execution = Promise.reject(error);
    }

    if (this.execution === undefined) {
      this.execution = execution;
    } else {
      // Because this.execution can be set by a call to stop with an error, we
      // cannot simply overwrite it.
      this.execution = this.execution.then(
        () => execution,
        // A rejected execution takes priority over errors passed to stop, but
        // an error passed to stop takes priority over a fulfilled execution.
        // Therefore, if the execution settles normally, we preserve any
        // errors passed to stop by rethrowing them here.
        (error) => execution.then(() => Promise.reject(error)),
      );
    }

    // We don’t have to call this.stop with the error because all that does is
    // reassign this.execution with the rejection.
    this.execution.catch(() => this.stop());
  }

  /**
   * A helper method which is called when a promise passed to push rejects.
   * Rejections which settle after stop are ignored. This behavior is useful
   * when you push a pending promise but want to finish the repeater instead.
   */
  private reject(error: any): Promise<TReturn | undefined> {
    if (this.state < RepeaterState.Stopped) {
      this.execution = Promise.resolve(this.execution).then(
        () => Promise.reject(error),
        () => Promise.reject(error),
      );
    }

    return this.finish();
  }

  /**
   * A helper method which unwraps promises to build IteratorResult objects.
   * Unwrapping promises prevents types of Repeater<Promise<any>> (where values
   * can be promises) and mimics the promise unwrapping behavior of async
   * generators where `yield` is equivalent to `yield await`.
   *
   * Additionally, this method is responsible for making sure that iterations
   * resolve in order by reassigning the this.pending property.
   *
   * All iterator results produced by the repeater are created here.
   */
  private unwrap(
    value: PromiseLike<T | TReturn | undefined> | T | TReturn | undefined,
  ): Promise<IteratorResult<T, TReturn>> {
    // We need to store done in a variable because this.state may be updated
    // between now and the time the promise settles.
    // If the value or the previous pending value rejects, done should be
    // updated to true.
    let done = this.state >= RepeaterState.Finished;
    if (done) {
      if (this.pending === undefined) {
        this.pending = Promise.resolve(value);
      } else {
        this.pending = this.pending.then(() => value, () => value);
      }
    } else if (this.pending === undefined) {
      // Rather than uniformly calling Promise.resolve(this.pending).then, we
      // check that this.pending is defined so that the first iteration
      // settles as soon as possible.
      this.pending = Promise.resolve(value).catch((error) => {
        done = true;
        return this.reject(error);
      });
    } else {
      this.pending = this.pending.then(
        () =>
          Promise.resolve(value).catch((error) => {
            done = true;
            return this.reject(error);
          }),
        () => {
          done = true;
          // previous value rejected so we drop the current value
          return undefined;
        },
      );
    }

    return this.pending.then((value: any) => ({ value, done }));
  }

  /**
   * A helper method which “consumes” the execution of the repeater, mimicking
   * the returning/throwing behavior of generators.
   *
   * The difference between stopping a repeater vs finishing a repeater is that
   * stopping a repeater allows next to continue to drain values from the
   * pushQueue/buffer, while finishing a repeater will clear all pending values
   * and end iteration immediately.
   *
   * Advances state to RepeaterState.Finished.
   */
  private finish(): Promise<TReturn | undefined> {
    const execution = Promise.resolve(this.execution);
    delete this.execution;
    if (this.state >= RepeaterState.Finished) {
      return execution;
    }

    this.stop();
    this.pushQueue = [];
    this.buffer = new FixedBuffer(0);
    this.state = RepeaterState.Finished;
    return execution;
  }

  /**
   * This method is bound and passed to the executor as the push argument.
   */
  private push(value: PromiseLike<T> | T): Promise<TNext | undefined> {
    Promise.resolve(value).catch(() => {});
    let promise: Promise<TNext | undefined>;
    if (this.state >= RepeaterState.Stopped) {
      return Promise.resolve(undefined);
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      pull.resolve(this.unwrap(value));
      if (this.pullQueue.length) {
        promise = Promise.resolve(this.pullQueue[0].value);
      } else {
        promise = new Promise((resolve) => (this.onnext = resolve));
      }
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve(undefined);
    } else if (this.pushQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
      );
    } else {
      promise = new Promise((resolve) =>
        this.pushQueue.push({ resolve, value }),
      );
    }

    promise.catch(() => {});
    return promise;
  }

  /**
   * This method is bound and passed to the executor as the stop argument.
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
    }

    if (this.onstop !== undefined) {
      this.onstop();
      delete this.onstop;
    }

    if (error != null) {
      if (this.execution === undefined) {
        this.execution = Promise.reject(error);
      } else {
        this.execution = this.execution.then(() => Promise.reject(error));
      }

      this.execution.catch(() => {});
    }

    for (const push of this.pushQueue) {
      push.resolve();
    }

    // If the pullQueue contains operations, the pushQueue and buffer are both
    // necessarily empty, so we don‘t have to worry about this.finish clearing
    // the pushQueue or buffer.
    for (const pull of this.pullQueue) {
      pull.resolve(this.unwrap(this.finish()));
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
      delete this.onnext;
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
      return this.unwrap(this.finish());
    } else if (this.pullQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Repeater.prototype.next are allowed on a single repeater.`,
      );
    }

    return new Promise((resolve) => this.pullQueue.push({ resolve, value }));
  }

  return(
    value?: PromiseLike<TReturn> | TReturn,
  ): Promise<IteratorResult<T, TReturn>> {
    this.stop();
    this.execution = Promise.resolve(this.execution).then(() => value);
    return this.unwrap(this.finish());
  }

  throw(error: any): Promise<IteratorResult<T, TReturn>> {
    if (
      this.state === RepeaterState.Initial ||
      this.state >= RepeaterState.Stopped
    ) {
      this.execution = Promise.resolve(this.execution).then(() =>
        Promise.reject(error),
      );
      return this.unwrap(this.finish());
    }

    const value = Promise.reject(error);
    value.catch(() => {});
    return this.next(value);
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
// AsyncGenerator type parameters. This allows the code to be used with older
// versions of typescript.
//
// TODO: use typesVersions to ship stricter types.
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
                returned = result.value;
                stop();
              }
            },
            (error) => stop(error),
          );
        }

        const result = await Promise.race([...results, stop]);
        if (result !== undefined) {
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
