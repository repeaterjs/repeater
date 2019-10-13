export interface RepeaterBuffer<T> {
  full: boolean;
  empty: boolean;
  add(value: PromiseLike<T> | T): void;
  remove(): PromiseLike<T> | T;
}

export class FixedBuffer<T> implements RepeaterBuffer<T> {
  private arr: (PromiseLike<T> | T)[] = [];

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

  add(value: PromiseLike<T> | T): void {
    if (this.full) {
      throw new Error("Buffer full");
    } else {
      this.arr.push(value);
    }
  }

  remove(): PromiseLike<T> | T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}

// TODO: use a circular buffer here
export class SlidingBuffer<T> implements RepeaterBuffer<T> {
  private arr: (PromiseLike<T> | T)[] = [];

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

  add(value: PromiseLike<T> | T): void {
    while (this.arr.length >= this.capacity) {
      this.arr.shift();
    }

    this.arr.push(value);
  }

  remove(): PromiseLike<T> | T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}

export class DroppingBuffer<T> implements RepeaterBuffer<T> {
  private arr: (PromiseLike<T> | T)[] = [];

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

  add(value: PromiseLike<T> | T): void {
    if (this.arr.length < this.capacity) {
      this.arr.push(value);
    }
  }

  remove(): PromiseLike<T> | T {
    if (this.empty) {
      throw new Error("Buffer empty");
    }

    return this.arr.shift()!;
  }
}
