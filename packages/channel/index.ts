export interface ChannelBuffer<T> {
  full: boolean;
  empty: boolean;
  add(value: T): void;
  remove(): T | undefined;
}

export class FixedBuffer<T> implements ChannelBuffer<T> {
  private arr: T[] = [];
  constructor(private capacity: number) {
    if (capacity < 0) {
      throw new RangeError("FixedBuffer capacity cannot be less than zero");
    }
  }

  get full(): boolean {
    return this.arr.length >= this.capacity;
  }

  get empty(): boolean {
    return this.arr.length === 0;
  }

  add(value: T): void {
    if (this.full) {
      throw new Error("Buffer full");
    } else {
      this.arr.push(value);
    }
  }

  remove(): T | undefined {
    return this.arr.shift();
  }
}

// TODO: use a circular buffer here
export class SlidingBuffer<T> implements ChannelBuffer<T> {
  readonly full = false;
  private arr: T[] = [];
  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new RangeError(
        "SlidingBuffer capacity cannot be less than or equal to zero",
      );
    }
  }

  get empty(): boolean {
    return this.arr.length === 0;
  }

  add(value: T): void {
    while (this.arr.length >= this.capacity) {
      this.arr.shift();
    }
    this.arr.push(value);
  }

  remove(): T | undefined {
    return this.arr.shift();
  }
}

export class DroppingBuffer<T> implements ChannelBuffer<T> {
  readonly full = false;
  private arr: T[] = [];

  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new RangeError(
        "DroppingBuffer capacity cannot be less than or equal to zero",
      );
    }
  }

  get empty(): boolean {
    return this.arr.length === 0;
  }

  add(value: T): void {
    if (this.arr.length < this.capacity) {
      this.arr.push(value);
    }
  }

  remove(): T | undefined {
    return this.arr.shift();
  }
}

interface PushOperation<T> {
  resolve(accepted: boolean): void;
  value: T;
}

interface PullOperation<T> {
  resolve(result: IteratorResult<T>): void;
  reject(err?: any): void;
}

export type ChannelExecutor<T> = (
  push: (value: T) => Promise<boolean>,
  close: (reason?: any) => void,
  stop: Promise<void>,
) => T | void | Promise<T | void>;

export class ChannelOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelOverflowError";
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, new.target.prototype);
    } else {
      (this as any).__proto__ = new.target.prototype;
    }
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, ChannelOverflowError);
    }
  }
}

export class Channel<T> implements AsyncIterableIterator<T> {
  private readonly MAX_QUEUE_LENGTH = 1024;
  private closed = false;
  private reason?: any;
  private onstart?: () => void;
  private onstop?: () => void;
  private pushQueue: PushOperation<T>[] = [];
  private pullQueue: PullOperation<T>[] = [];
  private execution?: Promise<T | void>;

  private push = (value: T): Promise<boolean> => {
    if (this.closed) {
      return Promise.resolve(false);
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      const result = { value, done: false };
      pull.resolve(result);
      return Promise.resolve(true);
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve(true);
    } else if (this.pushQueue.length >= this.MAX_QUEUE_LENGTH) {
      throw new ChannelOverflowError(
        `No more than ${
          this.MAX_QUEUE_LENGTH
        } pending calls to push are allowed on a single channel.`,
      );
    }
    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
  };

  private close = (reason?: any): void => {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.reason = reason;
    for (const push of this.pushQueue) {
      push.resolve(false);
    }
    this.pushQueue = [];
    Object.freeze(this.pushQueue);
    for (const pull of this.pullQueue) {
      if (reason == null) {
        pull.resolve({ done: true } as IteratorResult<T>);
      } else {
        pull.reject(reason);
      }
    }
    this.pullQueue = [];
    Object.freeze(this.pullQueue);
    if (this.onstart != null) {
      delete this.onstart;
      delete this.execution;
    }
    this.onstop!();
    delete this.onstop;
    Object.freeze(this);
  };

  constructor(
    executor: ChannelExecutor<T>,
    private buffer: ChannelBuffer<T> = new FixedBuffer(0),
  ) {
    const start = new Promise<void>((resolve) => (this.onstart = resolve));
    const stop = new Promise<void>((resolve) => (this.onstop = resolve));
    this.execution = start.then(async () => {
      try {
        // we await here so we can catch async errors in executor
        return await executor(this.push, this.close, stop);
      } catch (err) {
        if (this.closed) {
          throw err;
        }
        this.close(err);
      }
    });
  }

  next(): Promise<IteratorResult<T>> {
    if (!this.closed && this.onstart != null) {
      this.onstart();
      delete this.onstart;
    }

    if (!this.buffer.empty) {
      const result = { value: this.buffer.remove()!, done: false };
      if (this.pushQueue.length) {
        const push = this.pushQueue.shift()!;
        this.buffer.add(push.value);
        push.resolve(true);
      }
      return Promise.resolve(result);
    } else if (this.pushQueue.length) {
      const push = this.pushQueue.shift()!;
      const result = { value: push.value, done: false };
      push.resolve(true);
      return Promise.resolve(result);
    } else if (this.closed) {
      if (this.reason == null) {
        return Promise.resolve({ done: true } as IteratorResult<T>);
      } else {
        return Promise.reject(this.reason);
      }
    } else if (this.pullQueue.length >= this.MAX_QUEUE_LENGTH) {
      return Promise.reject(
        new ChannelOverflowError(
          `No more than ${
            this.MAX_QUEUE_LENGTH
          } pending calls to Channel.prototype.next are allowed on a single channel.`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      this.pullQueue.push({ resolve, reject });
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    if (this.execution == null) {
      return Promise.resolve({ done: true } as IteratorResult<T>);
    }
    return this.execution.then((value) => {
      return { value, done: true } as IteratorResult<T>;
    });
  }

  throw(reason: any): Promise<IteratorResult<T>> {
    if (this.closed) {
      return Promise.reject(reason);
    }
    this.close(reason);
    return this.return();
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
