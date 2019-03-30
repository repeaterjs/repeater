export interface Buffer<T> {
  full: boolean;
  empty: boolean;
  add(value: T): void;
  remove(): T | undefined;
  clear(): void;
}

export class FixedBuffer<T> implements Buffer<T> {
  protected arr: T[] = [];
  constructor(protected length: number) {}

  get full(): boolean {
    return this.arr.length >= this.length;
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

  clear(): void {
    this.arr = [];
  }
}

// TODO: use a circular buffer
export class SlidingBuffer<T> implements Buffer<T> {
  readonly full = false;
  protected arr: T[] = [];
  constructor(protected length: number) {}

  get empty(): boolean {
    return this.arr.length === 0;
  }

  add(value: T): void {
    while (this.arr.length >= this.length) {
      this.arr.shift();
    }
    this.arr.push(value);
  }

  remove(): T | undefined {
    return this.arr.shift();
  }

  clear(): void {
    this.arr = [];
  }
}

export class DroppingBuffer<T> implements Buffer<T> {
  readonly full = false;
  protected arr: T[] = [];

  constructor(protected length: number) {}

  get empty(): boolean {
    return this.arr.length === 0;
  }

  add(value: T): void {
    if (this.arr.length < this.length) {
      this.arr.push(value);
    }
  }

  remove(): T | undefined {
    return this.arr.shift();
  }

  clear(): void {
    this.arr = [];
  }
}

interface Put<T> {
  resolve(result: IteratorResult<T>): void;
  value: T;
}

interface Take<T> {
  resolve(result: IteratorResult<T>): void;
  reject(err?: any): void;
}

export type ChannelExecutor<T> = (
  put: (value: T) => Promise<IteratorResult<T>>,
  close: (reason?: any) => void,
) => any;

export class Channel<T> implements AsyncIterableIterator<T> {
  protected readonly MAX_QUEUE_LENGTH = 1024;
  closed = false;
  protected reason?: any;
  onclose?: (reason?: any) => void;
  protected puts: Put<T>[] = [];
  protected takes: Take<T>[] = [];

  // TODO: implement Channel.race static method?

  constructor(
    executor: ChannelExecutor<T>,
    protected buffer: Buffer<T> = new FixedBuffer(0),
  ) {
    const put = (value: T): Promise<IteratorResult<T>> => {
      if (this.closed) {
        return Promise.resolve({ done: true } as IteratorResult<T>);
      } else if (this.takes.length) {
        const take = this.takes.shift()!;
        const result = { value, done: false };
        take.resolve(result);
        return Promise.resolve(result);
      } else if (!this.buffer.full) {
        this.buffer.add(value);
        return Promise.resolve({ done: true } as IteratorResult<T>);
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

  close(reason?: any) {
    this.closed = true;
    this.reason = reason;
    for (const put of this.puts) {
      put.resolve({ done: true } as IteratorResult<T>);
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
  }

  next(): Promise<IteratorResult<T>> {
    if (!this.buffer.empty) {
      const result = { value: this.buffer.remove()!, done: false };
      if (this.puts.length) {
        const put = this.puts.shift()!;
        this.buffer.add(put.value);
        put.resolve(result);
      }
      return Promise.resolve(result);
    } else if (this.puts.length) {
      const put = this.puts.shift()!;
      const result = { value: put.value, done: false };
      put.resolve(result);
      return Promise.resolve(result);
    } else if (this.closed) {
      if (this.reason == null) {
        return Promise.resolve({ done: true } as IteratorResult<T>);
      } else {
        return Promise.reject(this.reason);
      }
    } else if (this.takes.length >= this.MAX_QUEUE_LENGTH) {
      throw new Error(`Queue length cannot exceed ${this.MAX_QUEUE_LENGTH}`);
    }

    return new Promise((resolve, reject) =>
      this.takes.push({ resolve, reject }),
    );
  }

  return(_any?: any): Promise<IteratorResult<T>> {
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
