import { ChannelBuffer, FixedBuffer } from "./buffers";

export const MAX_QUEUE_LENGTH = 1024;

export class ChannelOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelOverflowError";
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, new.target.prototype);
    } else {
      (this as any).__proto__ = new.target.prototype;
    }
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, ChannelOverflowError);
    }
  }
}

type MaybePromise<T> = Promise<T> | T;

interface PushOperation<T> {
  resolve(value: MaybePromise<boolean>): void;
  value: T;
}

interface PullOperation<T> {
  resolve(result: MaybePromise<IteratorResult<T>>): void;
  reject(err?: any): void;
}

export type ChannelExecutor<T> = (
  push: (value: T) => Promise<boolean>,
  close: (error?: any) => void,
  stop: Promise<T | void>,
) => MaybePromise<T | void>;

// The functionality for the Channel class is implemented in the
// ChannelController class and hidden using a private WeakMap to make the
// actual Channel class opaque and maximally compatible with the
// AsyncIterableIterator interface.
class ChannelController<T> {
  private closed = false;
  private pushQueue: PushOperation<T>[] = [];
  private pullQueue: PullOperation<T>[] = [];
  private execution: Promise<IteratorResult<T>>;
  private error?: any;
  private onstart?: () => void;
  private onstop?: (value?: MaybePromise<T>) => void;
  private onerror?: (err?: any) => void;

  constructor(executor: ChannelExecutor<T>, private buffer: ChannelBuffer<T>) {
    const start = new Promise<void>((onstart) => (this.onstart = onstart));
    const stop = new Promise<T | void>((onstop, onerror) => {
      this.onstop = onstop;
      this.onerror = onerror;
    });
    stop.catch((err) => {
      if (this.closed) {
        this.execution = Promise.reject(err);
      }
    });
    this.execution = start.then(async () => {
      let value: T | void;
      try {
        value = await executor(
          this.push.bind(this),
          this.close.bind(this),
          stop,
        );
      } catch (err) {
        if (this.closed) {
          throw err;
        }
        this.close(err);
      }
      return { value, done: true } as IteratorResult<T>;
    });
  }

  private push(value: T): Promise<boolean> {
    if (this.closed) {
      return Promise.resolve(false);
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      const result = { value, done: false };
      pull.resolve(result);
      return Promise.resolve(true);
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve(true);
    } else if (this.pushQueue.length >= MAX_QUEUE_LENGTH) {
      throw new ChannelOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single channel.`,
      );
    }
    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
  }

  private close(error?: any): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.error = error;
    for (const push of this.pushQueue) {
      push.resolve(false);
    }
    this.pushQueue = [];
    Object.freeze(this.pushQueue);
    for (const pull of this.pullQueue) {
      if (this.error == null) {
        pull.resolve(this.execution);
        this.execution = Promise.resolve({ done: true } as IteratorResult<T>);
      } else {
        pull.reject(this.error);
        delete this.error;
      }
    }
    this.pullQueue = [];
    Object.freeze(this.pullQueue);
    // if this.onstart is defined, the Channel has never started
    if (this.onstart != null) {
      this.execution = Promise.resolve({ done: true } as IteratorResult<T>);
      delete this.onstart;
    }
    if (this.onstop != null) {
      this.onstop();
    }
    delete this.onstop;
    delete this.onerror;
  }

  private finish(): Promise<IteratorResult<T>> {
    const execution = this.execution;
    this.execution = Promise.resolve({ done: true } as IteratorResult<T>);
    if (this.error != null) {
      const error = this.error;
      delete this.error;
      return Promise.reject(error);
    }
    return execution;
  }

  async pull(): Promise<IteratorResult<T>> {
    if (!this.closed && this.onstart != null) {
      this.onstart();
      delete this.onstart;
    }

    if (!this.buffer.empty) {
      const result = { value: this.buffer.remove()!, done: false };
      if (this.pushQueue.length) {
        const push = this.pushQueue.shift()!;
        this.buffer.add(push.value);
        push.resolve(true);
      }
      return result;
    } else if (this.pushQueue.length) {
      const push = this.pushQueue.shift()!;
      const result = { value: push.value, done: false };
      push.resolve(true);
      return result;
    } else if (this.closed) {
      return this.finish();
    } else if (this.pullQueue.length >= MAX_QUEUE_LENGTH) {
      throw new ChannelOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Channel.prototype.next are allowed on a single channel.`,
      );
    }
    return new Promise((resolve, reject) => {
      this.pullQueue.push({ resolve, reject });
    });
  }

  async return(value?: T): Promise<IteratorResult<T>> {
    if (this.closed) {
      return { value, done: true } as IteratorResult<T>;
    } else if (this.onstop != null) {
      this.onstop(value);
    }
    this.close();
    return this.finish();
  }

  async throw(error?: any): Promise<IteratorResult<T>> {
    if (this.closed) {
      throw error;
    } else if (this.onerror != null) {
      this.onerror(error);
    }
    this.close();
    return this.finish();
  }
}

type ChannelControllerMap<T = any> = WeakMap<Channel<T>, ChannelController<T>>;
const controllers: ChannelControllerMap = new WeakMap();

export class Channel<T> implements AsyncIterableIterator<T> {
  constructor(
    executor: ChannelExecutor<T>,
    buffer: ChannelBuffer<T> = new FixedBuffer(0),
  ) {
    controllers.set(this, new ChannelController(executor, buffer));
  }

  next(_value?: any): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("ChannelController missing from controllers WeakMap");
    }
    return controller.pull();
  }

  return(value?: T): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("ChannelController missing from controllers WeakMap");
    }
    return controller.return(value);
  }

  throw(error?: any): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("ChannelController missing from controllers WeakMap");
    }
    return controller.throw(error);
  }

  [Symbol.asyncIterator](): this {
    return this;
  }
}
