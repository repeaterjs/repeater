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
export interface RepeaterBuffer<TValue = unknown> {
  empty: boolean;
  full: boolean;
  add(value: TValue): unknown;
  remove(): TValue;
}

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

/** Makes sure promise-likes don't cause unhandled rejections. */
function swallow(value: any): void {
  if (value != null && typeof value.then === "function") {
    value.then(NOOP, NOOP);
  }
}

/*** TYPES ***/
export type Push<T, TNext = unknown> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;

export type Stop = ((err?: unknown) => undefined) & Promise<undefined>;

export type RepeaterExecutor<T, TReturn = any, TNext = unknown> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;

interface PushOperation<T, TNext> {
  value: Promise<T | undefined>;
  resolve(next?: PromiseLike<TNext> | TNext): unknown;
}

interface NextOperation<T, TReturn, TNext> {
  value: PromiseLike<TNext> | TNext | undefined;
  resolve(iteration: Promise<IteratorResult<T, TReturn>>): unknown;
}

/*** REPEATER STATES ***/
const Initial = 0;
const Started = 1;
const Stopped = 2;
const Done = 3;
const Rejected = 4;

export const MAX_QUEUE_LENGTH = 1024;

const NOOP = () => {};

interface RepeaterRecord<T, TReturn, TNext> {
  state: number;
  executor: RepeaterExecutor<T, TReturn, TNext>;
  buffer: RepeaterBuffer | undefined;
  pushes: Array<PushOperation<T, TNext>>;
  nexts: Array<NextOperation<T, TReturn, TNext>>;
  pending: Promise<unknown> | undefined;
  execution: Promise<TReturn | undefined> | undefined;
  err: unknown;
  onnext: (value?: PromiseLike<TNext> | TNext) => unknown;
  onstop: () => unknown;
}

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

function stop(r: RepeaterRecord<any, any, any>, err?: unknown): void {
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

function finish(r: RepeaterRecord<any, any, any>): void {
  if (r.state >= Done) {
    return;
  }

  if (r.state < Stopped) {
    stop(r);
  }

  r.state = Done;
  r.buffer = undefined;
  for (const next of r.nexts) {
    const execution: Promise<any> =
      r.pending === undefined
        ? consumeExecution(r)
        : r.pending.then(() => consumeExecution(r));
    next.resolve(createIteration(r, execution));
  }

  r.pushes = [];
  r.nexts = [];
}

function reject(r: RepeaterRecord<any, any, any>): void {
  if (r.state >= Rejected) {
    return;
  }

  if (r.state < Done) {
    finish(r);
  }

  r.state = Rejected;
}

function push(r: RepeaterRecord<any, any, any>, value: PromiseLike<any> | any): Promise<any> {
  swallow(value);
  if (r.pushes.length >= MAX_QUEUE_LENGTH) {
    throw new RepeaterOverflowError(
      `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
    );
  } else if (r.state >= Stopped) {
    return Promise.resolve(undefined);
  }

  let valueP: Promise<any> =
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

  let nextP: Promise<any>;
  if (r.nexts.length) {
    const next = r.nexts.shift()!;
    next.resolve(createIteration(r, valueP));
    if (r.nexts.length) {
      nextP = Promise.resolve(r.nexts[0].value);
    } else if (typeof r.buffer !== "undefined" && !r.buffer.full) {
      nextP = Promise.resolve(undefined);
    } else {
      nextP = new Promise((resolve) => (r.onnext = resolve));
    }
  } else if (typeof r.buffer !== "undefined" && !r.buffer.full) {
    r.buffer.add(valueP);
    nextP = Promise.resolve(undefined);
  } else {
    nextP = new Promise((resolve) => r.pushes.push({ resolve, value: valueP }));
  }

  // If an error is thrown into the repeater via the next or throw methods, we
  // give the repeater a chance to handle this by rejecting the promise returned
  // from push. If the push call is not immediately handled we throw the next
  // iteration of the repeater.
  // Float detection: to ensure engines always call .then() on the returned
  // object (engines skip .then() on native Promises, reading [[PromiseState]]
  // directly when awaited), we return a non-native thenable. We use
  // Object.create(nextP) so the returned value is instanceof Promise yet lacks
  // the internal [[PromiseState]] slot, forcing .then() to be invoked.
  // See: nodejs/node#17469
  let floating = true;
  const next = Object.create(nextP) as Promise<any>;
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

function createStop(r: RepeaterRecord<any, any, any>): Stop {
  const stopP = new Promise<undefined>((resolve) => (r.onstop = () => resolve(undefined)));
  return Object.assign(stop.bind(null, r), {
    then: stopP.then.bind(stopP),
    catch: stopP.catch.bind(stopP),
    finally: stopP.finally.bind(stopP),
  }) as Stop;
}

function execute(r: RepeaterRecord<any, any, any>): void {
  if (r.state >= Started) {
    return;
  }

  r.state = Started;
  const push1 = push.bind(null, r) as Push<any, any>;
  const stop1 = createStop(r);
  r.execution = new Promise((resolve) => resolve(r.executor(push1, stop1)));
  r.execution.catch(() => stop(r));
}

type RecordMap<T, TResult, TNext> = WeakMap<
  Repeater<T, TResult, TNext>,
  RepeaterRecord<T, TResult, TNext>
>;

const records: RecordMap<any, any, any> = new WeakMap();

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
}

if (typeof Symbol.asyncDispose === "symbol") {
  (Repeater.prototype as any)[Symbol.asyncDispose] = function (
    this: Repeater<any, any, any>,
  ) {
    return this.return();
  };
}

if (typeof Symbol.dispose === "symbol") {
  (Repeater.prototype as any)[Symbol.dispose] = function (
    this: Repeater<any, any, any>,
  ) {
    this.return();
  };
}
