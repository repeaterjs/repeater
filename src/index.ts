export interface Buffer<T> {
  full: boolean;
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

  add(value: T): void {
    if (this.arr.length < this.length) {
      this.arr.push(value);
    } else {
      throw new Error("Buffer full");
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

export class Channel<T> implements AsyncIterableIterator<T> {
  onclose?: (this: this) => void;
  public closed = false;
  protected onresult?: (result: IteratorResult<T>) => void;
  protected onready?: () => void;
  protected readonly done: IteratorResult<T> = {
    value: (undefined as unknown) as T,
    done: true,
  };

  constructor(protected buffer: Buffer<T> = new FixedBuffer(1)) {}

  put(value: T): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Cannot put to closed channel"));
    } else if (this.onresult != null) {
      this.onresult({ value, done: false });
      delete this.onresult;
      return Promise.resolve();
    }
    try {
      this.buffer.add(value);
    } catch (err) {
      return Promise.reject(err);
    }
    if (!this.buffer.full) {
      return Promise.resolve();
    }
    return new Promise((onready) => (this.onready = onready));
  }

  close(): void {
    this.closed = true;
    if (this.onresult != null) {
      this.onresult({ ...this.done });
      delete this.onresult;
    }
    if (this.onclose != null) {
      this.onclose();
      delete this.onclose;
    }
    if (this.onready != null) {
      this.onready();
      delete this.onready;
    }
    this.buffer.clear();
  }

  next(): Promise<IteratorResult<T>> {
    if (this.closed) {
      return Promise.resolve({ ...this.done });
    } else if (this.onresult != null) {
      return Promise.reject(new Error("Already pulling value from iterator"));
    }
    const value = this.buffer.remove();
    if (this.onready != null) {
      this.onready();
      delete this.onready;
    }
    return new Promise((onresult) => {
      if (value == null) {
        this.onresult = onresult;
      } else {
        onresult({ value, done: false });
      }
    });
  }

  return(_any?: any): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ ...this.done });
  }

  throw(_any?: any): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ ...this.done });
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
