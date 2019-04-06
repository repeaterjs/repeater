import { Buffer, FixedBuffer } from "./buffers";

interface PushOperation<T> {
  resolve(): void;
  value: T;
}

interface PullOperation<T> {
  resolve(result: IteratorResult<T>): void;
  reject(err?: any): void;
}

export type ChannelExecutor<T> = (
  push: (value: T) => Promise<void>,
  close: (reason?: any) => void,
  start: Promise<void>,
  stop: Promise<void>,
) => void;

export class ChannelOverflowError extends Error {
  name = "ChannelOverflowError";
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, ChannelOverflowError);
    }
  }
}

export class Channel<T> implements AsyncIterableIterator<T> {
  private closed = false;
  private reason?: any;
  private onstart?: () => void;
  private onstop?: () => void;
  private pushQueue: PushOperation<T>[] = [];
  private pullQueue: PullOperation<T>[] = [];
  private readonly MAX_QUEUE_LENGTH = 1024;

  constructor(
    executor: ChannelExecutor<T>,
    private buffer: Buffer<T> = new FixedBuffer(0),
  ) {
    const start = new Promise<void>((resolve) => (this.onstart = resolve));
    const stop = new Promise<void>((resolve) => (this.onstop = resolve));
    try {
      Promise.resolve(
        executor(this.push.bind(this), this.close.bind(this), start, stop),
      ).catch((err) => this.close(err));
    } catch (err) {
      this.close(err);
    }
  }

  private push(value: T): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      const result = { value, done: false };
      pull.resolve(result);
      return Promise.resolve();
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve();
    } else if (this.pushQueue.length >= this.MAX_QUEUE_LENGTH) {
      throw new ChannelOverflowError(
        `No more than ${
          this.MAX_QUEUE_LENGTH
        } pending pushes are allowed on a single channel. Consider using a windowed buffer.`,
      );
    }
    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
  }

  private close(reason?: any): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.reason = reason;
    for (const push of this.pushQueue) {
      push.resolve();
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
    }
    this.onstop!();
    delete this.onstop;
    Object.freeze(this);
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
        push.resolve();
      }
      return Promise.resolve(result);
    } else if (this.pushQueue.length) {
      const push = this.pushQueue.shift()!;
      const result = { value: push.value, done: false };
      push.resolve();
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
          } pending pulls are allowed on a single channel. Consider using a windowed buffer.`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      this.pullQueue.push({ resolve, reject });
    });
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ done: true } as IteratorResult<T>);
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
