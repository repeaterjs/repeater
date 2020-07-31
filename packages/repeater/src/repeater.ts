/*** Buffers ***/

/**
 * Buffers allow multiple values to be pushed onto a repeater without having pushes wait or throw overflow errors.
 */
export interface RepeaterBuffer {
  full: boolean;
  empty: boolean;
  // We don’t type the values for add and remove because the buffer should be opaque anyways.
  add(value: unknown): unknown;
  remove(): unknown;
}

/**
 * Fixed buffers allow you to push a set amount of values to the repeater without pushes pausing or throwing errors.
 */
export class FixedBuffer implements RepeaterBuffer {
  // capacity
  _c: number;
  // queue
  _q: Array<unknown>;

  get empty(): boolean {
    return this._q.length === 0;
  }

  get full(): boolean {
    return this._q.length >= this._c;
  }

  constructor(capacity: number) {
    if (capacity < 0) {
      throw new RangeError("FixedBuffer capacity may not be less than 0");
    }

    this._c = capacity;
    this._q = [];
  }

  add(value: unknown): void {
    if (this.full) {
      throw new Error("Buffer full");
    } else {
      this._q.push(value);
    }
  }

  remove(): unknown {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this._q.shift()!;
  }
}

/**
 * Sliding buffers allow you to push a set amount of values to the repeater without the push function pausing or throwing. If the number of values exceeds the capacity set in the constructor, the buffer will discard the earliest values added to the buffer.
 */
// TODO: use a circular buffer here
export class SlidingBuffer implements RepeaterBuffer {
  // capacity
  _c: number;
  // queue
  _q: Array<unknown>;

  get empty(): boolean {
    return this._q.length === 0;
  }

  get full(): boolean {
    return false;
  }

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError("SlidingBuffer capacity may not be less than 1");
    }

    this._c = capacity;
    this._q = [];
  }

  add(value: unknown): void {
    while (this._q.length >= this._c) {
      this._q.shift();
    }

    this._q.push(value);
  }

  remove(): unknown {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this._q.shift();
  }
}

/**
 * Dropping buffers allow you to push a set amount of values to the repeater without the push function pausing or throwing. If the number of values exceeds the capacity set in the constructor, the buffer will discard the latest values added to the buffer.
 */
export class DroppingBuffer implements RepeaterBuffer {
  // capacity
  _c: number;
  // queue
  _q: Array<unknown>;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError("DroppingBuffer capacity may not be less than 1");
    }

    this._c = capacity;
    this._q = [];
  }

  get empty(): boolean {
    return this._q.length === 0;
  }

  get full() {
    return false;
  }

  add(value: unknown): void {
    if (this._q.length < this._c) {
      this._q.push(value);
    }
  }

  remove(): unknown {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this._q.shift();
  }
}

const NOOP = () => {};

function isPromiseLike(value: any): value is PromiseLike<unknown> {
  return value != null && typeof value.then === "function";
}

function upgradePromiseLike<T>(value: PromiseLike<T>): Promise<T> {
  if (!(value instanceof Promise)) {
    return Promise.resolve(value);
  }

  return value;
}

/**
 * A utility function to make sure all promise-like values are handled.
 */
function swallow(value: unknown): void {
  if (isPromiseLike(value)) {
    upgradePromiseLike(value).catch(NOOP);
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

/*** Repeater States ***/
/**
 * The following is an enumeration of all possible repeater states. These states work sequentially, and repeaters may only move to higher states.
 */

/**
 * The initial state of the repeater.
 */
const Initial = 0;

/**
 * Repeaters advance from initial to started the first time the next method is called on the repeater.
 */
const Started = 1;

/**
 * Repeaters advanced to stopped when the stop method is called.
 */
const Stopped = 2;

/**
 * Repeaters advance to finished when there are no values left to be pulled from the repeater. This means that all calls to next will return an iteration where the done property is set to true.
 */
const Finished = 3;

/**
 * Repeaters advance to rejected if an error is thrown into the repeater
 */
const Rejected = 4;

export const MAX_QUEUE_LENGTH = 1024;

/**
 * The functionality for repeaters is implemented in this helper class and
 * hidden using a private WeakMap to make repeaters themselves opaque and
 * maximally compatible with async generators.
 */
class RepeaterController<T, TReturn = any, TNext = unknown> {
  state: number;
  executor: RepeaterExecutor<T, TReturn, TNext>;
  buffer: RepeaterBuffer | undefined;
  // pushes and pulls will never both contain operations at the same time.
  pushes: PushOperation<T, TNext>[] = [];
  pulls: PullOperation<T, TReturn, TNext>[] = [];
  // We continuously re-assign pending in push to make sure all results settle
  // in order. The pending promise will never reject.
  pending?: Promise<T | undefined>;
  // execution is set to the return value of calling the executor and can be
  // re-assigned depending on whether stop, return or throw is called.
  execution?: Promise<TReturn | undefined>;
  err?: any;
  onnext: (value?: PromiseLike<TNext> | TNext) => unknown = NOOP;
  onstop: () => unknown = NOOP;
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>,
    buffer: RepeaterBuffer | undefined,
  ) {
    this.executor = executor;
    this.buffer = buffer;
    this.state = Initial;
  }

  /**
   * This method runs synchronously the first time next is called.
   *
   * Advances state to Started
   */
  execute(): void {
    if (this.state >= Started) {
      return;
    }

    this.state = Started;
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
  unwrap(
    value: Promise<T | TReturn | undefined> | T | TReturn | undefined,
  ): Promise<IteratorResult<T, TReturn>> {
    const done = this.state >= Finished;
    return Promise.resolve(value).then((value: any) => {
      if (!done && this.state >= Rejected) {
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
  consume(): Promise<TReturn | undefined> {
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
   * pushes and buffer, while finishing a repeater will clear all pending
   * values and end iteration immediately. Once, a repeater is finished, all
   * iterations will have the done property set to true.
   *
   * Advances state to Finished
   */
  finish(): void {
    if (this.state >= Finished) {
      return;
    }

    if (this.state < Stopped) {
      this.stop();
    }

    this.state = Finished;
    this.pushes = [];
    this.buffer = undefined;
  }

  /**
   * Called when a promise passed to push rejects, or when a push call is
   * unhandled.
   *
   * Advances state to Rejected
   */
  reject(): void {
    if (this.state >= Rejected) {
      return;
    }

    if (this.state < Finished) {
      this.finish();
    }

    this.state = Rejected;
  }

  /**
   * This method is bound and passed to the executor as the push argument.
   */
  push(value: PromiseLike<T> | T): Promise<TNext | undefined> {
    swallow(value);
    if (this.pushes.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
      );
    } else if (this.state >= Stopped) {
      return Promise.resolve(undefined);
    }

    let valueP: Promise<T | undefined> =
      this.pending === undefined
        ? Promise.resolve(value)
        : this.pending.then(() => value);
    valueP = valueP.catch((err) => {
      if (this.state < Stopped) {
        this.err = err;
      }

      this.reject();
      // Explicitly return undefined to avoid typescript’s horrible void type
      return undefined;
    });

    let nextP: Promise<TNext | undefined>;
    if (this.pulls.length) {
      const pull = this.pulls.shift()!;
      pull.resolve(this.unwrap(valueP));
      if (this.pulls.length) {
        nextP = Promise.resolve(this.pulls[0].value);
      } else {
        nextP = new Promise((resolve) => (this.onnext = resolve));
      }
    } else if (typeof this.buffer !== "undefined" && !this.buffer.full) {
      this.buffer.add(valueP);
      nextP = Promise.resolve(undefined);
    } else {
      nextP = new Promise((resolve) => {
        this.pushes.push({ resolve, value: valueP });
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
   * Advances state to Stopped
   */
  stop(err?: any): void {
    if (this.state >= Stopped) {
      return;
    }

    this.state = Stopped;
    this.onnext();
    this.onstop();
    if (this.err == null) {
      this.err = err;
    }

    for (const push of this.pushes) {
      push.resolve();
    }

    // If the pulls contains operations, the pushes and buffer are both
    // necessarily empty, so we don‘t have to worry about this.finish clearing
    // the pushes or buffer.
    if (this.pulls.length) {
      this.finish();
      for (const pull of this.pulls) {
        const execution: Promise<TReturn | undefined> =
          this.pending === undefined
            ? this.consume()
            : this.pending.then(() => this.consume());
        pull.resolve(this.unwrap(execution));
      }
    }

    this.pulls = [];
  }

  next(
    value?: PromiseLike<TNext> | TNext,
  ): Promise<IteratorResult<T, TReturn>> {
    swallow(value);
    if (this.pulls.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Repeater.prototype.next are allowed on a single repeater.`,
      );
    }

    if (this.state <= Initial) {
      this.execute();
    }

    this.onnext(value);
    if (typeof this.buffer !== "undefined" && !this.buffer.empty) {
      const result = this.unwrap(
        this.buffer.remove() as Promise<T | undefined>,
      );
      if (this.pushes.length) {
        const push = this.pushes.shift()!;
        this.buffer.add(push.value);
        this.onnext = push.resolve;
      }

      return result;
    } else if (this.pushes.length) {
      const push = this.pushes.shift()!;
      this.onnext = push.resolve;
      return this.unwrap(push.value);
    } else if (this.state >= Stopped) {
      this.finish();
      return this.unwrap(this.consume());
    }

    return new Promise((resolve) => this.pulls.push({ resolve, value }));
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
      this.state <= Initial ||
      this.state >= Stopped ||
      (typeof this.buffer !== "undefined" && !this.buffer.empty)
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
    buffer?: RepeaterBuffer | undefined,
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
