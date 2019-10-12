import {
  Repeater,
  RepeaterBuffer,
  RepeaterOverflowError,
  MAX_QUEUE_LENGTH,
  SlidingBuffer,
} from "@repeaterjs/repeater";

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    Object.defineProperty(this, "name", {
      value: "TimeoutError",
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

class DeferredTimer<T> {
  resolve!: (value: T) => void;
  promise: Promise<T>;
  private reject!: (err: any) => void;
  private timeout: any;

  constructor(private wait: number) {
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  run(fn: () => T): void {
    if (this.timeout != null) {
      throw new Error("Cannot run a timer multiple times");
    }
    this.timeout = setTimeout(() => {
      try {
        const value = fn();
        this.resolve(value);
      } catch (err) {
        this.reject(err);
      }
    }, this.wait);
  }

  clear(): void {
    clearTimeout(this.timeout);
    // In the code below, this method is only called after the repeater is
    // stopped. Because repeaters swallow rejections which settle after stop, we
    // use this mechanism to make any pending call which has received the
    // deferred promise resolve to `{ done: true }`.
    this.reject(new TimeoutError("THIS ERROR SHOULD NEVER BE SEEN"));
  }
}

export function delay(wait: number): Repeater<number> {
  return new Repeater(async (push, stop) => {
    const timers: Set<DeferredTimer<number>> = new Set();
    try {
      let stopped = false;
      stop.then(() => (stopped = true));
      while (!stopped) {
        const timer: DeferredTimer<number> = new DeferredTimer(wait);
        const yielded = push(timer.promise);
        timers.add(timer);
        if (timers.size > MAX_QUEUE_LENGTH) {
          throw new RepeaterOverflowError(
            `No more than ${MAX_QUEUE_LENGTH} calls to next are allowed on a single delay repeater.`,
          );
        }

        timer.run(() => {
          timers.delete(timer);
          return Date.now();
        });

        await yielded;
      }

      return stop;
    } finally {
      for (const timer of timers) {
        timer.clear();
      }
    }
  });
}

export function timeout(wait: number): Repeater<void> {
  return new Repeater(async (push, stop) => {
    let timer: DeferredTimer<void> | undefined;
    let stopped = false;
    stop.then(() => (stopped = true));
    while (!stopped) {
      const timer1: DeferredTimer<void> = new DeferredTimer(wait);
      const yielded = push(timer1.promise);
      if (timer != null) {
        timer.resolve();
      }

      timer1.run(() => {
        throw new TimeoutError(`${wait}ms elapsed without next being called`);
      });
      timer = timer1;
      await yielded;
    }

    if (timer != null) {
      timer.clear();
    }

    return stop;
  });
}

export function interval(
  wait: number,
  buffer: RepeaterBuffer<number> = new SlidingBuffer(1),
): Repeater<number> {
  return new Repeater<number>(async (push, stop) => {
    push(Date.now());
    const timer = setInterval(() => push(Date.now()), wait);
    await stop;
    clearInterval(timer);
  }, buffer);
}
