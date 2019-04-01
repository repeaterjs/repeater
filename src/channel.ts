import { Buffer, FixedBuffer } from "./buffers";

interface PutOperation<T> {
  resolve(): void;
  value: T;
}

interface TakeOperation<T> {
  resolve(result: IteratorResult<T>): void;
  reject(err?: any): void;
}

export type ChannelExecutor<T> = (
  put: (value: T) => Promise<void>,
  close: (reason?: any) => void,
) => any;

export class Channel<T> implements AsyncIterableIterator<T> {
  closed = false;
  onclose?: (reason?: any) => void;
  protected reason?: any;
  protected puts: PutOperation<T>[] = [];
  protected takes: TakeOperation<T>[] = [];
  protected readonly MAX_QUEUE_LENGTH = 1024;

  constructor(
    executor: ChannelExecutor<T>,
    protected buffer: Buffer<T> = new FixedBuffer(0),
  ) {
    const put = (value: T): Promise<void> => {
      if (this.closed) {
        return Promise.resolve();
      } else if (this.takes.length) {
        const take = this.takes.shift()!;
        const result = { value, done: false };
        take.resolve(result);
        return Promise.resolve();
      } else if (!this.buffer.full) {
        this.buffer.add(value);
        return Promise.resolve();
      } else if (this.puts.length >= this.MAX_QUEUE_LENGTH) {
        throw new Error(`Queue length cannot exceed ${this.MAX_QUEUE_LENGTH}`);
      }
      return new Promise((resolve) => this.puts.push({ resolve, value }));
    };
    try {
      Promise.resolve(executor(put, this.close.bind(this))).catch((err) => {
        this.close(err);
      });
    } catch (err) {
      this.close(err);
    }
  }

  close(reason?: any): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.reason = reason;
    for (const put of this.puts) {
      put.resolve();
    }
    this.puts = [];
    for (const take of this.takes) {
      if (reason == null) {
        take.resolve({ done: true } as IteratorResult<T>);
      } else {
        take.reject(reason);
      }
    }
    this.takes = [];
    if (this.onclose != null) {
      this.onclose(reason);
    }
    Object.freeze(this);
  }

  next(): Promise<IteratorResult<T>> {
    if (!this.buffer.empty) {
      const result = { value: this.buffer.remove()!, done: false };
      if (this.puts.length) {
        const put = this.puts.shift()!;
        this.buffer.add(put.value);
        put.resolve();
      }
      return Promise.resolve(result);
    } else if (this.puts.length) {
      // this is only really possible if we have a buffer of length 0
      const put = this.puts.shift()!;
      const result = { value: put.value, done: false };
      put.resolve();
      return Promise.resolve(result);
    } else if (this.closed) {
      if (this.reason == null) {
        return Promise.resolve({ done: true } as IteratorResult<T>);
      } else {
        return Promise.reject(this.reason);
      }
    } else if (this.takes.length >= this.MAX_QUEUE_LENGTH) {
      return Promise.reject(
        new Error(`Queue length cannot exceed ${this.MAX_QUEUE_LENGTH}`),
      );
    }

    return new Promise((resolve, reject) =>
      this.takes.push({ resolve, reject }),
    );
  }

  return(_?: any): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ done: true } as IteratorResult<T>);
  }

  throw(reason?: any): Promise<IteratorResult<T>> {
    this.close(reason);
    return Promise.resolve({ done: true } as IteratorResult<T>);
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
