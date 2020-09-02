/** An error subclass which is thrown when there are too many pending push or next operations on a single repeater. */
export class RepeaterOverflowError extends Error {
  constructor(message: string) {
    super(message);
    Object.defineProperty(this, "name", {
      value: "RepeaterOverflowError",
      enumerable: false,
    });
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, this.constructor.prototype);
    } else {
      (this as any).__proto__ = this.constructor.prototype;
    }

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

/*** BUFFERS ***/
/** A special queue interface which allow multiple values to be pushed onto a repeater without having pushes wait or throw overflow errors, passed as the second argument to the repeater constructor. */
export interface RepeaterBuffer<TValue = unknown> {
  empty: boolean;
  full: boolean;
  add(value: TValue): unknown;
  remove(): TValue;
}

/** A buffer which allows you to push a set amount of values to the repeater without pushes waiting or throwing errors. */
export class FixedBuffer implements RepeaterBuffer {
  // capacity
  _c: number;
  // queue
  _q: Array<unknown>;

  constructor(capacity: number) {
    if (capacity < 0) {
      throw new RangeError("Capacity may not be less than 0");
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

// TODO: Use a circular buffer here.
/** Sliding buffers allow you to push a set amount of values to the repeater without pushes waiting or throwing errors. If the number of values exceeds the capacity set in the constructor, the buffer will discard the earliest values added. */
export class SlidingBuffer implements RepeaterBuffer {
  // capacity
  _c: number;
  // queue
  _q: Array<unknown>;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError("Capacity may not be less than 1");
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

/** Dropping buffers allow you to push a set amount of values to the repeater without the push function waiting or throwing errors. If the number of values exceeds the capacity set in the constructor, the buffer will discard the latest values added. */
export class DroppingBuffer implements RepeaterBuffer {
  // capacity
  _c: number;
  // queue
  _q: Array<unknown>;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError("Capacity may not be less than 1");
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

/** Makes sure promise-likes don’t cause unhandled rejections. */
function swallow(value: any): void {
  if (value != null && typeof value.then === "function") {
    value.then(NOOP, NOOP);
  }
}

/*** TYPES ***/
/** The type of the first argument passed to the executor callback. */
export type Push<T, TNext = unknown> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;

/** The type of the second argument passed to the executor callback. A callable promise. */
export type Stop = ((err?: unknown) => undefined) & Promise<undefined>;

/** The type of the callback passed to the Repeater constructor. */
export type RepeaterExecutor<T, TReturn = any, TNext = unknown> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;

/** The type of the object passed to the push queue. */
interface PushOperation<T, TNext> {
  // The value passed to the push function.
  value: Promise<T | undefined>;
  // The resolve function of the promise return from push.
  resolve(next?: PromiseLike<TNext> | TNext): unknown;
}

/** The type of the object passed to the next queue. */
interface NextOperation<T, TReturn, TNext> {
  // The value passed to the next method.
  value: PromiseLike<TNext> | TNext | undefined;
  // The resolve function of the promise returned from next.
  resolve(result: Promise<IteratorResult<T, TReturn>>): unknown;
}

/*** REPEATER STATES ***/
/** The following is an enumeration of all possible repeater states. These states are ordered, and a repeater may only advance to higher states. */

/** The initial state of the repeater. */
const Initial = 0;

/** Repeaters advance to this state the first time the next method is called on the repeater. */
const Started = 1;

/** Repeaters advance to this state when the stop function is called. */
const Stopped = 2;

/** Repeaters advance to this state when there are no values left to be pulled from the repeater. */
const Done = 3;

/** Repeaters advance to this state if an error is thrown into the repeater. */
const Rejected = 4;

/** The maximum number of push or next operations which may exist on a single repeater. */
export const MAX_QUEUE_LENGTH = 1024;

const NOOP = () => {};

/** An interface containing the private data of repeaters, only accessible through a private WeakMap. */
interface RepeaterRecord<T, TReturn, TNext> {
  // A number enum. States are ordered and the repeater will move through these states over the course of its lifetime. See REPEATER STATES.
  state: number;

  // The function passed to the repeater constructor.
  executor: RepeaterExecutor<T, TReturn, TNext>;

  // The buffer passed to the repeater constructor.
  buffer: RepeaterBuffer | undefined;

  // A queue of values which were pushed.
  pushes: Array<PushOperation<T, TNext>>;

  // A queue of requests for values.
  nexts: Array<NextOperation<T, TReturn, TNext>>;
  // NOTE: both the push queue and the next queue will never contain values at the same time.

  // A promise which is continuously reassigned and chained so that all repeater iterations settle in order.
  pending: Promise<unknown> | undefined;

  // The return value of the executor.
  execution: Promise<TReturn | undefined> | undefined;

  // An error passed to the stop function.
  err: unknown;

  // A callback set to the resolve function of the promise returned from push.
  onnext: (value?: PromiseLike<TNext> | TNext) => unknown;

  // A callback set to the resolve function of the stop promise.
  onstop: () => unknown;
}

/** A helper function used to mimic the behavior of async generators where the final iteration is consumed. */
function consumeExecution<T, TReturn, TNext>(
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

/** A helper function for building iterations from values. Promises are unwrapped, so that iterations never have their value property set to a promise. */
function createIteration<T, TReturn, TNext>(
  r: RepeaterRecord<T, TReturn, TNext>,
  value: Promise<T | TReturn | undefined> | T | TReturn | undefined,
): Promise<IteratorResult<T, TReturn>> {
  const done = r.state >= Done;
  return Promise.resolve(value).then((value: any) => {
    if (!done && r.state >= Rejected) {
      return consumeExecution<T, TReturn, TNext>(r).then((value: any) => ({
        value,
        done: true,
      }));
    }

    return { value, done };
  });
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

  if (
    r.pushes.length === 0 &&
    (typeof r.buffer === "undefined" || r.buffer.empty)
  ) {
    finish(r);
  } else {
    for (const push of r.pushes) {
      push.resolve();
    }
  }
}

/**
 * The difference between stopping a repeater vs finishing a repeater is that stopping a repeater allows next to continue to drain values from the push queue and buffer, while finishing a repeater will clear all pending values and end iteration immediately. Once, a repeater is finished, all iterations will have the done property set to true.
 *
 * Advances state to Done.
 */
function finish<T, TReturn, TNext>(r: RepeaterRecord<T, TReturn, TNext>): void {
  if (r.state >= Done) {
    return;
  }

  if (r.state < Stopped) {
    stop(r);
  }

  r.state = Done;
  r.buffer = undefined;
  for (const next of r.nexts) {
    const execution: Promise<TReturn | undefined> =
      r.pending === undefined
        ? consumeExecution<T, TReturn, TNext>(r)
        : r.pending.then(() => consumeExecution<T, TReturn, TNext>(r));
    next.resolve(createIteration<T, TReturn, TNext>(r, execution));
  }

  r.pushes = [];
  r.nexts = [];
}

/**
 * Called when a promise passed to push rejects, or when a push call is unhandled.
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

/** This function is bound and passed to the executor as the push argument. */
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
  if (r.nexts.length) {
    const next = r.nexts.shift()!;
    next.resolve(createIteration<T, TReturn, TNext>(r, valueP));
    if (r.nexts.length) {
      nextP = Promise.resolve(r.nexts[0].value);
    } else {
      nextP = new Promise((resolve) => (r.onnext = resolve));
    }
  } else if (typeof r.buffer !== "undefined" && !r.buffer.full) {
    r.buffer.add(valueP);
    nextP = Promise.resolve(undefined);
  } else {
    nextP = new Promise((resolve) => r.pushes.push({ resolve, value: valueP }));
  }

  // If an error is thrown into the repeater via the next or throw methods, we give the repeater a chance to handle this by rejecting the promise returned from push. If the push call is not immediately handled we throw the next iteration of the repeater.
  // To check that the promise returned from push is floating, we modify the then and catch methods of the returned promise so that they flip the floating flag. The push function actually does not return a promise, because modern engines do not call the then and catch methods on native promises. By making next a plain old javascript object, we ensure that the then and catch methods will be called.
  let floating = true;
  let next = {} as Promise<TNext | undefined>;
  const unhandled = nextP.catch((err) => {
    if (floating) {
      throw err;
    }

    return undefined; // void :(
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
  r.pending = valueP
    .then(() => unhandled)
    .catch((err) => {
      r.err = err;
      reject(r);
    });

  return next;
}

/**
 * Creates the stop callable promise which is passed to the executor
 */
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
 * Calls the executor passed into the constructor. This function is called the first time the next method is called on the repeater.
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
  r.execution = new Promise((resolve) => resolve(r.executor(push1, stop1)));
  // TODO: We should consider stopping all repeaters when the executor settles.
  r.execution.catch(() => stop(r));
}

type RecordMap<T, TResult, TNext> = WeakMap<
  Repeater<T, TResult, TNext>,
  RepeaterRecord<T, TResult, TNext>
>;

const records: RecordMap<any, any, any> = new WeakMap();

// NOTE: While repeaters implement and are assignable to the AsyncGenerator interface, and you can use the types interchangeably, we don’t use typescript’s implements syntax here because this would make supporting earlier versions of typescript trickier. This is because TypeScript version 3.6 changed the iterator types by adding the TReturn and TNext type parameters.
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
      nexts: [],
      pending: undefined,
      execution: undefined,
      onnext: NOOP,
      onstop: NOOP,
    });
  }

  next(
    value?: PromiseLike<TNext> | TNext,
  ): Promise<IteratorResult<T, TReturn>> {
    swallow(value);
    const r = records.get(this);
    if (r === undefined) {
      throw new Error("WeakMap error");
    }

    if (r.nexts.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to next are allowed on a single repeater.`,
      );
    }

    if (r.state <= Initial) {
      execute(r);
    }

    r.onnext(value);
    if (typeof r.buffer !== "undefined" && !r.buffer.empty) {
      const result = createIteration(
        r,
        r.buffer.remove() as Promise<T | undefined>,
      );
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
      return createIteration(r, consumeExecution(r));
    }

    return new Promise((resolve) => r.nexts.push({ resolve, value }));
  }

  return(
    value?: PromiseLike<TReturn> | TReturn,
  ): Promise<IteratorResult<T, TReturn>> {
    swallow(value);
    const r = records.get(this);
    if (r === undefined) {
      throw new Error("WeakMap error");
    }

    finish(r);
    // We override the execution because return should always return the value passed in.
    r.execution = Promise.resolve(r.execution).then(() => value);
    return createIteration(r, consumeExecution(r));
  }

  throw(err: unknown): Promise<IteratorResult<T, TReturn>> {
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
      // If r.err is already set, that mean the repeater has already produced an error, so we throw that error rather than the error passed in, because doing so might be more informative for the caller.
      if (r.err == null) {
        r.err = err;
      }

      return createIteration(r, consumeExecution(r));
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
// TODO: move these combinators to their own file.
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

// NOTE: whenever you see any variables called `advance` or `advances`, know that it is a hack to get around the fact that `Promise.race` leaks memory. These variables are intended to be set to the resolve function of a promise which is constructed and awaited as an alternative to Promise.race. For more information, see this comment in the Node.js issue tracker: https://github.com/nodejs/node/issues/17469#issuecomment-685216777.
function race<T>(
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
                // This iterator has won, advance i and resolve the promise.
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

        const iterations: Array<IteratorResult<unknown>> | undefined = await new Promise(
          (resolve) => (advance = resolve),
        );
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
    const advances: Array<(iteration?: IteratorResult<unknown>) => unknown> = [];
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

      // We continuously yield and mutate the same values array so we shallow copy it each time it is pushed.
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
