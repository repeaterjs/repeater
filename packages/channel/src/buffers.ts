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
