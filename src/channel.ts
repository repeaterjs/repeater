import { Buffer, FixedBuffer } from "./buffers";

interface PushOperation<T> {
  resolve(): void;
  value: T;
}

interface TakeOperation<T> {
  resolve(result: IteratorResult<T>): void;
  reject(err?: any): void;
}

export type ChannelExecutor<T> = (
  push: (value: T) => Promise<void>,
  close: (reason?: any) => void,
  start: Promise<void>,
  stop: Promise<void>,
) => void;

export class Channel<T> implements AsyncIterableIterator<T> {
  protected closed = false;
  protected reason?: any;
  protected onstart?: () => void;
  protected onstop?: () => void;
  protected pushQueue: PushOperation<T>[] = [];
  protected takeQueue: TakeOperation<T>[] = [];
  protected readonly MAX_QUEUE_LENGTH = 1024;

  constructor(
    executor: ChannelExecutor<T>,
    protected buffer: Buffer<T> = new FixedBuffer(0),
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

  protected push(value: T): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    } else if (this.takeQueue.length) {
      const take = this.takeQueue.shift()!;
      const result = { value, done: false };
      take.resolve(result);
      return Promise.resolve();
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve();
    } else if (this.pushQueue.length >= this.MAX_QUEUE_LENGTH) {
      throw new Error(
        `Push queue length cannot exceed ${this.MAX_QUEUE_LENGTH}`,
      );
    }
    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
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
      // this branch is only possible if we have a buffer of length 0
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
    } else if (this.takeQueue.length >= this.MAX_QUEUE_LENGTH) {
      return Promise.reject(
        new Error(`Take queue length cannot exceed ${this.MAX_QUEUE_LENGTH}`),
      );
    }

    return new Promise((resolve, reject) =>
      this.takeQueue.push({ resolve, reject }),
    );
  }

  protected close(reason?: any): void {
    if (this.closed) {
      if (reason == null) {
        return;
      }
      // If we close the channel with a reason when it has already closed, rather than swallowing the reason, we rethrow it here. This may lead to an unhandled promise rejection if, for instance, an error occurs in the executor after the stop promise resolves.
      throw reason;
    }
    this.closed = true;
    this.reason = reason;
    for (const push of this.pushQueue) {
      push.resolve();
    }
    this.pushQueue = [];
    Object.freeze(this.pushQueue);
    for (const take of this.takeQueue) {
      if (reason == null) {
        take.resolve({ done: true } as IteratorResult<T>);
      } else {
        take.reject(reason);
      }
    }
    this.takeQueue = [];
    Object.freeze(this.takeQueue);
    if (this.onstart != null) {
      delete this.onstart;
    }
    this.onstop!();
    delete this.onstop;
    Object.freeze(this);
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ done: true } as IteratorResult<T>);
  }

  throw(reason: any): Promise<IteratorResult<T>> {
    this.close(reason);
    return Promise.reject(reason);
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
