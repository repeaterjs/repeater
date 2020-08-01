/*** BUFFERS ***/

/**
* Buffers allow multiple values to be pushed onto a repeater without having pushes wait or throw overflow errors.
 */
export interface RepeaterBuffer {
  empty: boolean;
  full: boolean;
  // We don’t type the values for add and remove because the buffer should be opaque anyways.
  add(value: unknown): unknown;
  remove(): unknown;
}

/**
 * Fixed buffers allow you to push a set amount of values to the repeater without pushes pausing or throwing errors.
 */
export class FixedBuffer implements RepeaterBuffer {
  _c: number;
  // queue
  _q: Array<unknown>;

  constructor(capacity: number) {
    if (capacity < 0) {
      throw new RangeError("FixedBuffer capacity may not be less than 0");
    }

    this._c = capacity;
    this._q = [];
  }

  get empty(): boolean {
    return this._q.length === 0;
  }

  get full(): boolean {
    return this._q.length >= this._c;
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

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError("SlidingBuffer capacity may not be less than 1");
    }

    this._c = capacity;
    this._q = [];
  }

  get empty(): boolean {
    return this._q.length === 0;
  }

  get full(): boolean {
    return false;
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

/*** UTILITIES ***/
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
 * A function to make sure promise-like values don’t cause unhandled rejections.
 */
function swallow(value: unknown): void {
  if (isPromiseLike(value)) {
    upgradePromiseLike(value).catch(NOOP);
  }
}

/*** TYPES ***/
/**
 * The type of the first argument passed to the executor.
 */
export type Push<T, TNext = unknown> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;

/**
 * The type of the second argument passed to the executor.
 */
export type Stop = ((err?: any) => undefined) & Promise<undefined>;

/**
 * The type of the callback passed to the Repeater constructor.
 */
export type RepeaterExecutor<T, TReturn = any, TNext = unknown> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;

/**
 * The type of the object passed to push requests.
 */
interface PushOperation<T, TNext> {
  resolve(next?: PromiseLike<TNext> | TNext): unknown;
  value: Promise<T | undefined>;
}

/**
 * The type of the object passed to push requests.
 */
interface PullOperation<T, TReturn, TNext> {
  resolve(result: Promise<IteratorResult<T, TReturn>>): unknown;
  value?: PromiseLike<TNext> | TNext;
}

/**
 * An error class which is thrown when there are too many pending pushes or pulls on a single repeater.
 */
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

/*** REPEATER STATES ***/
/**
 * The following is an enumeration of all possible repeater states. These states work sequentially, and repeaters may only move to higher states.
 */

/**
 * The initial state of the repeater.
 */
const Initial = 0;

/**
 * Repeaters advance to this state the first time the next method is called on the repeater.
 */
const Started = 1;

/**
 * Repeaters advance to this state when the stop method is called.
 */
const Stopped = 2;

/**
 * Repeaters advance to this state when there are no values left to be pulled from the repeater. This means that all calls to next will return an iteration where the done property is set to true.
 */
const Done = 3;

/**
 * Repeaters advance to this state if an error is thrown into the repeater.
 */
const Rejected = 4;

export const MAX_QUEUE_LENGTH = 1024;

const NOOP = () => {};
/**
 * An interface containing the private data of repeaters. The public repeater class will only ever contain the same methods and properties as async generators, and it’s important that repeater users do not under any circumstances.
 */
interface RepeaterRecord<T, TReturn, TNext> {
  // A number enum. States are ordered and the repeater will move through its states over the course of its lifecycle. See REPEATER STATES above.
  state: number;

  // The function passed to the repeater constructor.
  executor: RepeaterExecutor<T, TReturn, TNext>;

  // The buffer passed to the repeater constructor.
  buffer: RepeaterBuffer | undefined;

  // NOTE: both pushes and pulls will never contain values at the same time.
  // A queue of values which were pushed.
  pushes: Array<PushOperation<T, TNext>>;

  // A queue of requests for values.
  pulls: Array<PullOperation<T, TReturn, TNext>>;

  // A promise which is continuously reassigned so that all repeater iterations settle in order.
  pending: Promise<unknown> | undefined;

  // The return value of the executor.
  execution: Promise<TReturn | undefined> | undefined;

  // An error thrown by the repeater to finish iteration.
  err: any;

  // A callback set to the resolve function of the promise returned from push.
  onnext: (value?: PromiseLike<TNext> | TNext) => unknown;

  // A callback set to the resolve function of the stop promise.
  onstop: () => unknown;
}

/**
 * A helper function used to mimic the behavior of async generators where the final result or any error are consumed, so that further calls to next, return or throw return { value: undefined, done: true }.
 */
function consumeFinalIteration<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
): Promise<TReturn | undefined> {
  const err = r.err;
  const execution = Promise.resolve(r.execution).then((value) => {
    if (err != null) {
      throw err;
    }

    return value;
  });

  r.err = undefined;
  r.execution = execution.then(
    () => undefined,
    () => undefined,
  );
  return r.pending === undefined ? execution : r.pending.then(() => execution);
}

/**
 * A helper function which builds the Promise<IteratorResult> objects from values. This method prevents types of Repeater<Promise<any>>, where the value property of iterations is a promise, and mimics the promise unwrapping behavior of async generators, where yield is equivalent to yield await.
 */
function createIteration<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
  value: Promise<T | TReturn | undefined> | T | TReturn | undefined,
): Promise<IteratorResult<T, TReturn>> {
  const done = r.state >= Done;
  return Promise.resolve(value).then((value: any) => {
    if (!done && r.state >= Rejected) {
      return consumeFinalIteration<T, TReturn, TNext>(r).then((value: any) => ({
        value,
        done: true,
      }));
    }

    return { value, done };
  });
}

/**
 * This function is bound and passed to the executor as the push argument.
 */
function push<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
  value: PromiseLike<T> | T,
): Promise<TNext | undefined> {
  swallow(value);
  if (r.pushes.length >= MAX_QUEUE_LENGTH) {
    throw new RepeaterOverflowError(
      `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
    );
  } else if (r.state >= Stopped) {
    return Promise.resolve(undefined);
  }

  let valueP: Promise<T | undefined> =
    r.pending === undefined
      ? Promise.resolve(value)
      : r.pending.then(() => value);
  valueP = valueP.catch((err) => {
    if (r.state < Stopped) {
      r.err = err;
    }

    reject(r);
    return undefined; // void :(
  });

  let nextP: Promise<TNext | undefined>;
  if (r.pulls.length) {
    const pull = r.pulls.shift()!;
    pull.resolve(createIteration<T, TReturn, TNext>(r, valueP));
    if (r.pulls.length) {
      nextP = Promise.resolve(r.pulls[0].value);
    } else {
      nextP = new Promise((resolve) => (r.onnext = resolve));
    }
  } else if (typeof r.buffer !== "undefined" && !r.buffer.full) {
    r.buffer.add(valueP);
    nextP = Promise.resolve(undefined);
  } else {
    nextP = new Promise((resolve) => r.pushes.push({ resolve, value: valueP }));
  }

  // If an error is thrown into the repeater via the next or throw methods, we give the repeater a chance to handle this by rejecting the promise returned from push. If the push call is not awaited we call reject and throw the next iteration of the repeater.

  // To check that the promise returned from push is floating, we modify the then and catch methods of the returned promise so that they flip the floating flag above. The push function actually does not return a promise, because modern engines do not call the then and catch methods on native promises. By making next a plain old javascript object, we ensure that the then and catch methods will be called.
  let floating = true;
  let next = {} as Promise<TNext | undefined>;
  const unhandled = nextP.catch((err) => {
    if (floating) {
      throw err;
    }

    return undefined; // void :(
  });
  swallow(unhandled);

  next.then = (onfulfilled, onrejected): any => {
    floating = false;
    return Promise.prototype.then.call(nextP, onfulfilled, onrejected);
  };

  next.catch = (onrejected): any => {
    floating = false;
    return Promise.prototype.catch.call(nextP, onrejected);
  };

  next.finally = nextP.finally.bind(nextP);
  r.pending = valueP
    .then(() => unhandled)
    .catch((err) => {
      r.err = err;
      reject(r);
    });

  return next;
}

/**
 * This function is bound and passed to the executor as the stop argument.
 *
 * Advances state to Stopped.
 */
function stop<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
  err?: unknown,
): void {
  if (r.state >= Stopped) {
    return;
  }

  r.state = Stopped;
  r.onnext();
  r.onstop();
  if (r.err == null) {
    r.err = err;
  }

  for (const push of r.pushes) {
    push.resolve();
  }

  // If the pulls contains operations, the pushes and buffer are both necessarily empty, so we don‘t have to worry about r.finish clearing the pushes or buffer.
  if (r.pulls.length) {
    finish(r);
    for (const pull of r.pulls) {
      const execution: Promise<TReturn | undefined> =
        r.pending === undefined
          ? consumeFinalIteration<T, TReturn, TNext>(r)
          : r.pending.then(() => consumeFinalIteration<T, TReturn, TNext>(r));
      pull.resolve(createIteration<T, TReturn, TNext>(r, execution));
    }
  }

  r.pulls = [];
}

/**
 * The difference between stopping a repeater vs finishing a repeater is that
 * stopping a repeater allows next to continue to drain values from the
 * pushes and buffer, while finishing a repeater will clear all pending
 * values and end iteration immediately. Once, a repeater is finished, all
 * iterations will have the done property set to true.
 *
 * Advances state to Done.
 */
function finish(r: RepeaterRecord<any, any, any>): void {
  if (r.state >= Done) {
    return;
  }

  if (r.state < Stopped) {
    stop(r);
  }

  r.state = Done;
  r.pushes = [];
  r.buffer = undefined;
}

/**
 * Called when a promise passed to push rejects, or when a push call is
 * unhandled.
 *
 * Advances state to Rejected.
 */
function reject(r: RepeaterRecord<any, any, any>): void {
  if (r.state >= Rejected) {
    return;
  }

  if (r.state < Done) {
    finish(r);
  }

  r.state = Rejected;
}

function createStop<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
): Stop {
  const stop1 = stop.bind(null, r) as Stop;
  const stopP = new Promise<undefined>((resolve) => (r.onstop = resolve));
  stop1.then = stopP.then.bind(stopP);
  stop1.catch = stopP.catch.bind(stopP);
  stop1.finally = stopP.finally.bind(stopP);
  return stop1;
}

/**
 * This function runs synchronously the first time next is called, and calls the returned
 *
 * Advances state to Started.
 */
function execute<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
): void {
  if (r.state >= Started) {
    return;
  }

  r.state = Started;
  const push1 = (push as any).bind(null, r) as Push<T, TNext>;
  const stop1 = createStop(r);
  try {
    r.execution = Promise.resolve(r.executor(push1, stop1));
  } catch (err) {
    // sync err in executor
    r.execution = Promise.reject(err);
  }

  // TODO: We should consider stopping all repeaters when the executor settles.
  r.execution.catch(() => stop(r));
}

type RecordMap<T, TResult, TNext> = WeakMap<Repeater<T, TResult, TNext>, RepeaterRecord<T, TResult, TNext>>;

const records: RecordMap<any, any, any> = new WeakMap();

// We do not export any types which use >=3.6 IteratorResult, AsyncIterator or AsyncGenerator types. This allows the code to be used with older versions of typescript. Therefore, we cannot implement `AsyncIterator` or `AsyncIterableIterator` here because the default types are busted as hell.
// TODO: use typesVersions to ship stricter types.
export class Repeater<T, TReturn = any, TNext = unknown> {
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>,
    buffer?: RepeaterBuffer | undefined,
  ) {
    records.set(this, {
      executor,
      buffer,
      err: undefined,
      state: Initial,
      pushes: [],
      pulls: [],
      pending: undefined,
      execution: undefined,
      onnext: NOOP,
      onstop: NOOP,
    });
  }

  next(
    value?: PromiseLike<TNext> | TNext,
  ): Promise<IteratorResult<T, TReturn>> {
    const r = records.get(this);
    if (r === undefined) {
      throw new Error("WeakMap error");
    }

    swallow(value);
    if (r.pulls.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Repeater.prototype.next are allowed on a single repeater.`,
      );
    }

    if (r.state <= Initial) {
      execute(r);
    }

    r.onnext(value);
    if (typeof r.buffer !== "undefined" && !r.buffer.empty) {
      const result = createIteration(r, r.buffer.remove() as Promise<T | undefined>);
      if (r.pushes.length) {
        const push = r.pushes.shift()!;
        r.buffer.add(push.value);
        r.onnext = push.resolve;
      }

      return result;
    } else if (r.pushes.length) {
      const push = r.pushes.shift()!;
      r.onnext = push.resolve;
      return createIteration(r, push.value);
    } else if (r.state >= Stopped) {
      finish(r);
      return createIteration(r, consumeFinalIteration(r));
    }

    return new Promise((resolve) => r.pulls.push({ resolve, value }));
  }

  return(
    value?: PromiseLike<TReturn> | TReturn,
  ): Promise<IteratorResult<T, TReturn>> {
    const r = records.get(this);
    if (r === undefined) {
      throw new Error("WeakMap error");
    }

    swallow(value);
    finish(r);
    r.execution = Promise.resolve(r.execution).then(() => value);
    return createIteration(r, consumeFinalIteration(r));
  }

  throw(err: any): Promise<IteratorResult<T, TReturn>> {
    const r = records.get(this);
    if (r === undefined) {
      throw new Error("WeakMap error");
    }

    if (
      r.state <= Initial ||
      r.state >= Stopped ||
      (typeof r.buffer !== "undefined" && !r.buffer.empty)
    ) {
      finish(r);
      // If r.err is already set, that mean the repeater has already produced an error, so we throw that error rather than the error passed in.
      if (r.err == null) {
        r.err = err;
      }

      return createIteration(r, consumeFinalIteration(r));
    }

    return this.next(Promise.reject(err));
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  // TODO: Remove these static methods from the class.
  static race = race;
  static merge = merge;
  static zip = zip;
  static latest = latest;
}

/*** COMBINATOR FUNCTIONS ***/

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

// TODO: move these combinators to their own file.
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
