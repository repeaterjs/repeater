export interface Buffer<T> {
  full: boolean;
  empty: boolean;
  add(value: T): void;
  remove(): T | undefined;
  clear(): void;
}

export class FixedBuffer<T> implements Buffer<T> {
  protected arr: T[] = [];
  constructor(protected capacity: number) {
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

  clear(): void {
    this.arr = [];
  }
}

// TODO: use a circular buffer
export class SlidingBuffer<T> implements Buffer<T> {
  readonly full = false;
  protected arr: T[] = [];
  constructor(protected capacity: number) {
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

  clear(): void {
    this.arr = [];
  }
}

export class DroppingBuffer<T> implements Buffer<T> {
  readonly full = false;
  protected arr: T[] = [];

  constructor(protected capacity: number) {
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

  clear(): void {
    this.arr = [];
  }
}
