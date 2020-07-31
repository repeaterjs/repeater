export interface RepeaterBuffer {
  full: boolean;
  empty: boolean;
  add(value: unknown): unknown;
  remove(): unknown;
}

export class FixedBuffer implements RepeaterBuffer {
  private arr: unknown[] = [];

  get empty(): boolean {
    return this.arr.length === 0;
  }

  get full(): boolean {
    return this.arr.length >= this.capacity;
  }

  constructor(private capacity: number) {
    if (capacity < 0) {
      throw new RangeError("FixedBuffer capacity cannot be less than zero");
    }
  }

  add(value: unknown): void {
    if (this.full) {
      throw new Error("Buffer full");
    } else {
      this.arr.push(value);
    }
  }

  remove(): unknown {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}

// TODO: use a circular buffer here
export class SlidingBuffer implements RepeaterBuffer {
  private arr: unknown[] = [];

  get empty(): boolean {
    return this.arr.length === 0;
  }

  readonly full = false;

  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new RangeError(
        "SlidingBuffer capacity cannot be less than or equal to zero",
      );
    }
  }

  add(value: unknown): void {
    while (this.arr.length >= this.capacity) {
      this.arr.shift();
    }

    this.arr.push(value);
  }

  remove(): unknown {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}

export class DroppingBuffer implements RepeaterBuffer {
  private arr: unknown[] = [];

  get empty(): boolean {
    return this.arr.length === 0;
  }

  readonly full = false;

  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new RangeError(
        "DroppingBuffer capacity cannot be less than or equal to zero",
      );
    }
  }

  add(value: unknown): void {
    if (this.arr.length < this.capacity) {
      this.arr.push(value);
    }
  }

  remove(): unknown {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}

export const MAX_QUEUE_LENGTH = 1024;

const NOOP = () => {};

function isPromiseLike(value: any): value is PromiseLike<unknown> {
  return value != null && typeof value.then === "function";
}

function swallow(value: unknown): void {
  if (isPromiseLike(value)) {
    Promise.resolve(value).catch(NOOP);
  }
}

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

export type Stop = ((err?: any) => undefined) & Promise<undefined>;

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
  private pending?: Promise<T | undefined>;
  // execution is set to the return value of calling the executor and can be
  // re-assigned depending on whether stop, return or throw is called.
  private execution?: Promise<TReturn | undefined>;
  private err?: any;
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
    const stop: Stop = this.stop.bind(this) as Stop;
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
    } catch (err) {
      // sync err in executor
      this.execution = Promise.reject(err);
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
    value: Promise<T | TReturn | undefined> | T | TReturn | undefined,
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
   * return or throw return { value: undefined, done: true }.
   */
  private consume(): Promise<TReturn | undefined> {
    const err = this.err;
    const execution = Promise.resolve(this.execution).then((value) => {
      if (err != null) {
        throw err;
      }

      return value;
    });
    this.err = undefined;
    this.execution = execution.then(
      () => undefined,
      () => undefined,
    );
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
    swallow(value);
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
    valueP = valueP.catch((err) => {
      if (this.state < RepeaterState.Stopped) {
        this.err = err;
      }

      this.reject();
      // Explicitly return undefined to avoid typescript’s horrible void type
      return undefined;
    });

    let nextP: Promise<TNext | undefined>;
    if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      pull.resolve(this.unwrap(valueP));
      if (this.pullQueue.length) {
        nextP = Promise.resolve(this.pullQueue[0].value);
      } else {
        nextP = new Promise((resolve) => (this.onnext = resolve));
      }
    } else if (!this.buffer.full) {
      this.buffer.add(valueP);
      nextP = Promise.resolve(undefined);
    } else {
      nextP = new Promise((resolve) => {
        this.pushQueue.push({ resolve, value: valueP });
      });
    }

    // This method of catching unhandled rejections is adapted from
    // https://stackoverflow.com/a/57792542/1825413
    // NOTE: We can’t return a real promise here because await does not call then/catch/finally callbacks directly in newer versions of V8. We have to create an plain old object which does not inherit from the Promise class so that the reassigned promise methods are actually called.
    let floating = true;
    let err: any;
    let next = {} as Promise<TNext | undefined>;
    const unhandled = nextP.catch((err1) => {
      if (floating) {
        err = err1;
      }

      return undefined;
    });

    next.then = (onfulfilled, onrejected): any => {
      floating = false;
      return Promise.prototype.then.call(nextP, onfulfilled, onrejected);
    };

    next.catch = (onrejected): any => {
      floating = false;
      return Promise.prototype.catch.call(nextP, onrejected);
    };

    next.finally = nextP.finally.bind(nextP);

    this.pending = valueP
      .then(() => unhandled)
      .then(() => {
        if (err != null) {
          this.err = err;
          this.reject();
        }

        // Explicitly return undefined to avoid typescript’s horrible void type
        return undefined;
      });

    return next;
  }

  /**
   * This method is bound and passed to the executor as the stop argument.
   *
   * Advances state to RepeaterState.Stopped
   */
  private stop(err?: any): void {
    if (this.state >= RepeaterState.Stopped) {
      return;
    }

    this.state = RepeaterState.Stopped;
    this.onnext();
    this.onstop();
    if (this.err == null) {
      this.err = err;
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
    swallow(value);
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
      const result = this.unwrap(
        this.buffer.remove() as Promise<T | undefined>,
      );
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
    swallow(value);
    this.finish();
    this.execution = Promise.resolve(this.execution).then(() => value);
    return this.unwrap(this.consume());
  }

  throw(err: any): Promise<IteratorResult<T, TReturn>> {
    if (
      this.state <= RepeaterState.Initial ||
      this.state >= RepeaterState.Stopped ||
      !this.buffer.empty
    ) {
      this.finish();
      if (this.err == null) {
        this.err = err;
      }

      return this.unwrap(this.consume());
    }

    return this.next(Promise.reject(err));
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

  throw(err?: any): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller === undefined) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.throw(err);
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  static race = race;
  static merge = merge;
  static zip = zip;
  static latest = latest;
}

function isAsyncIterable(value: any): value is AsyncIterable<unknown> {
  return value != null && typeof value[Symbol.asyncIterator] === "function";
}

function isIterable(value: any): value is Iterable<unknown> {
  return value != null && typeof value[Symbol.iterator] === "function";
}

function asyncIterators(
  contenders: Iterable<any>,
  options: { yieldValues?: boolean; returnValues?: boolean },
): AsyncIterator<any>[] {
  const { yieldValues, returnValues } = options;
  const iters: AsyncIterator<any>[] = [];
  for (const contender of contenders) {
    if (isAsyncIterable(contender)) {
      iters.push((contender as AsyncIterable<any>)[Symbol.asyncIterator]());
    } else if (isIterable(contender)) {
      const iter = (contender as Iterable<any>)[Symbol.iterator]();
      iters.push(
        (async function* syncToAsyncIterator() {
          try {
            let result = iter.next();
            while (!result.done) {
              yield result.value;
              result = iter.next();
            }

            return result.value;
          } finally {
            iter.return && iter.return();
          }
        })(),
      );
    } else {
      iters.push(
        (async function* valueToAsyncIterator() {
          if (yieldValues) {
            yield contender;
          }

          if (returnValues) {
            return contender;
          }
        })(),
      );
    }
  }

  return iters;
}

function race<T>(
  contenders: Iterable<T>,
): Repeater<
  T extends AsyncIterable<infer U> | Iterable<infer U>
    ? U extends PromiseLike<infer V>
      ? V
      : U
    : never
> {
  const iters = asyncIterators(contenders, { returnValues: true });
  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return;
    }

    let stopped = false;
    stop.then(() => (stopped = true));
    let returned: any;
    try {
      while (!stopped) {
        const results = iters.map((iter) => iter.next());
        for (const result of results) {
          Promise.resolve(result).then(
            (result) => {
              if (result.done && !stopped) {
                stop();
                stopped = true;
                returned = result.value;
              }
            },
            (err) => stop(err),
          );
        }

        const result = await Promise.race([stop, ...results]);
        if (result !== undefined && !result.done) {
          await push(result.value);
        }
      }

      return returned;
    } finally {
      stop();
      await Promise.race(iters.map((iter) => iter.return && iter.return()));
    }
  });
}

function merge<T>(
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
  const iters = asyncIterators(contenders, { yieldValues: true });
  return new Repeater(async (push, stop) => {
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
        } finally {
          iter.return && (await iter.return());
        }
      }),
    );
    stop();
    return returned;
  });
}

type Contender<T> =
  | AsyncIterable<Promise<T> | T>
  | Iterable<Promise<T> | T>
  | PromiseLike<T>
  | T;

function zip(contenders: []): Repeater<never>;
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
function zip(contenders: Iterable<any>) {
  const iters = asyncIterators(contenders, { returnValues: true });
  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return [];
    }

    let stopped = false;
    stop.then(() => (stopped = true));
    try {
      while (!stopped) {
        const resultsP = Promise.all(iters.map((iter) => iter.next()));
        const results = await Promise.race([stop, resultsP]);
        if (results === undefined) {
          return;
        }

        const values = results.map((result) => result.value);
        if (results.some((result) => result.done)) {
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

function latest(contenders: []): Repeater<never>;
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
function latest(contenders: Iterable<any>) {
  const iters = asyncIterators(contenders, {
    yieldValues: true,
    returnValues: true,
  });
  return new Repeater(async (push, stop) => {
    if (!iters.length) {
      stop();
      return [];
    }

    let stopped = false;
    stop.then(() => (stopped = true));
    try {
      const resultsP = Promise.all(iters.map((iter) => iter.next()));
      const results = await Promise.race([stop, resultsP]);
      if (results === undefined) {
        return;
      }

      const values = results.map((result) => result.value);
      if (results.every((result) => result.done)) {
        return values;
      }

      await push(values.slice());
      return await Promise.all(
        iters.map(async (iter, i) => {
          if (results[i].done) {
            return results[i].value;
          }

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
        }),
      );
    } finally {
      stop();
      await Promise.all(iters.map((iter) => iter.return && iter.return()));
    }
  });
}
