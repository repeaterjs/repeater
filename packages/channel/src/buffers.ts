import {
  CannotReadFromEmptyBufferError,
  CannotWriteToFullBufferError,
  InvalidBufferCapacityError,
} from "./errors";

export abstract class ChannelBuffer<T> {
  public abstract get full(): boolean;
  public abstract get empty(): boolean;

  public abstract add(value: T): void;
  public abstract remove(): T;

  constructor(protected capacity: number) {
    if (capacity < 0) {
      throw new InvalidBufferCapacityError(capacity);
    }
  }
}

export class FixedBuffer<T> extends ChannelBuffer<T> {
  private arr: T[] = [];

  public get empty(): boolean {
    return this.arr.length === 0;
  }

  public get full(): boolean {
    return this.arr.length >= this.capacity;
  }

  public add(value: T): void {
    if (this.full) {
      throw new CannotWriteToFullBufferError(this.capacity);
    } else {
      this.arr.push(value);
    }
  }

  public remove(): T {
    if (this.empty) {
      throw new CannotReadFromEmptyBufferError();
    }

    return this.arr.shift()!;
  }
}

// TODO: use a circular buffer here
export class SlidingBuffer<T> extends ChannelBuffer<T> {
  private arr: T[] = [];

  public get empty(): boolean {
    return this.arr.length === 0;
  }

  public get full(): boolean {
    return false;
  }

  public add(value: T): void {
    while (this.arr.length >= this.capacity) {
      this.arr.shift();
    }

    this.arr.push(value);
  }

  public remove(): T {
    if (this.empty) {
      throw new CannotReadFromEmptyBufferError();
    }

    return this.arr.shift()!;
  }
}

export class DroppingBuffer<T> extends ChannelBuffer<T> {
  private arr: T[] = [];

  public get empty(): boolean {
    return this.arr.length === 0;
  }

  public get full(): boolean {
    return false;
  }

  public add(value: T): void {
    if (this.arr.length < this.capacity) {
      this.arr.push(value);
    }
  }

  public remove(): T {
    if (this.empty) {
      throw new CannotReadFromEmptyBufferError();
    }

    return this.arr.shift()!;
  }
}
