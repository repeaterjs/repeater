export interface ChannelBuffer<T> {
  full: boolean;
  empty: boolean;
  add(value: T): void;
  remove(): T;
}

export class FixedBuffer<T> implements ChannelBuffer<T> {
  private arr: T[] = [];
  get empty(): boolean {
    return this.arr.length === 0;
  }
  get full(): boolean {
    return this.arr.length >= this.capacity;
  }

  constructor(private capacity: number) {
    if (capacity < 0) {
      throw new RangeError("FixedBuffer capacity cannot be less than zero");
    }
  }

  add(value: T): void {
    if (this.full) {
      throw new Error("Buffer full");
    } else {
      this.arr.push(value);
    }
  }

  remove(): T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }
    return this.arr.shift()!;
  }
}

// TODO: use a circular buffer here
export class SlidingBuffer<T> implements ChannelBuffer<T> {
  private arr: T[] = [];
  get empty(): boolean {
    return this.arr.length === 0;
  }
  readonly full = false;
  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new RangeError(
        "SlidingBuffer capacity cannot be less than or equal to zero",
      );
    }
  }

  add(value: T): void {
    while (this.arr.length >= this.capacity) {
      this.arr.shift();
    }
    this.arr.push(value);
  }

  remove(): T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }
    return this.arr.shift()!;
  }
}

export class DroppingBuffer<T> implements ChannelBuffer<T> {
  private arr: T[] = [];
  get empty(): boolean {
    return this.arr.length === 0;
  }
  readonly full = false;
  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new RangeError(
        "DroppingBuffer capacity cannot be less than or equal to zero",
      );
    }
  }

  add(value: T): void {
    if (this.arr.length < this.capacity) {
      this.arr.push(value);
    }
  }

  remove(): T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }
    return this.arr.shift()!;
  }
}

export class InfiniteCapacityBuffer<T> implements ChannelBuffer<T> {
  private arr: T[] = [];

  public get empty(): boolean {
    return this.arr.length === 0;
  }

  public get full(): boolean {
    return false;
  }

  public add(value: T): void {
    this.arr.push(value);
  }

  public remove(): T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}
