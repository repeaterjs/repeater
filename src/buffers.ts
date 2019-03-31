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
