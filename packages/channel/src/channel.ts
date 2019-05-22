import { ChannelBuffer, FixedBuffer } from "./buffers";
import { Contender, iterators } from "./utils";

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

// Next is the argument passed to AsyncIterator.next
// Return is the argument passed to AsyncIterator.return
// The AsyncIterator interface doesn’t parameterize these arguments so these
// type aliases are used to keep track of where the arguments are used.
type Next = any;
type Return = any;

interface PushOperation<T> {
  resolve(next?: Next): void;
  value: T;
}

interface PullOperation<T> {
  resolve(result: Promise<IteratorResult<T>> | IteratorResult<T>): void;
  reject(err?: any): void;
  value?: Next;
}

export type ChannelExecutor<T> = (
  push: (value: T) => Promise<Next | void>,
  close: (error?: any) => void,
  stop: Promise<Return | void>,
) => Promise<Return | void> | Return | void;

/**
 * The functionality for channels is implemented in this helper class and
 * hidden using a private WeakMap to make channels opaque and maximally
 * compatible with the AsyncIterableIterator interface.
 */
class ChannelController<T> implements AsyncIterator<T> {
  // pushQueue and pullQueue will never both contain operations at the same time
  private pushQueue: PushOperation<T>[] = [];
  private pullQueue: PullOperation<T>[] = [];

  // Because we delete these properties after they are used, the presence of
  // these properties indicates the current state of ChannelController.

  // if onstart == null, the channel has started
  private onstart?: () => void;
  // if onstop == null, the channel has stopped/closed
  private onstop?: (value?: Return) => void;
  // if execution == null, the channel is finished and frozen
  private execution?: Promise<IteratorResult<T>>;
  // if error != null, the next iteration will result in a promise rejection
  // and the execution result will be thrown away
  private error?: any;

  constructor(executor: ChannelExecutor<T>, private buffer: ChannelBuffer<T>) {
    const start = new Promise<void>((onstart) => (this.onstart = onstart));
    const push = this.push.bind(this);
    const close = this.close.bind(this);
    const stop = new Promise<Return | void>((onstop) => (this.onstop = onstop));
    this.execution = start.then(async () => {
      let value: Return | void;
      try {
        value = await executor(push, close, stop);
      } catch (err) {
        if (this.onstop == null) {
          throw err;
        }
        this.close(err);
        return { done: true } as IteratorResult<T>;
      }
      this.close();
      return { value, done: true } as IteratorResult<T>;
    });
    this.execution.catch(() => {});
  }

  private push(value: T): Promise<Next | void> {
    if (this.onstop == null) {
      return Promise.resolve();
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      const result = { value, done: false };
      pull.resolve(result);
      return Promise.resolve(pull.value);
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve();
    } else if (this.pushQueue.length >= MAX_QUEUE_LENGTH) {
      throw new ChannelOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single channel.`,
      );
    }
    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
  }

  private close(error?: any): void {
    if (this.onstop == null) {
      return;
    }
    this.onstop();
    delete this.onstop;
    if (this.onstart != null && error == null) {
      // This branch executes if and only if return is called before the channel is started.
      delete this.execution;
    }
    delete this.onstart;
    this.error = error;
    for (const push of this.pushQueue) {
      push.resolve();
    }
    this.pushQueue = [];
    Object.freeze(this.pushQueue);
    // Calling this.finish freezes this so we resolve pulls last.
    // If the pullQueue is not empty, the buffer and pushQueue are necessarily
    // empty, so we don‘t have to worry about this.finish clearing the buffer.
    const pullQueue = this.pullQueue;
    this.pullQueue = [];
    Object.freeze(this.pullQueue);
    for (const pull of pullQueue) {
      pull.resolve(this.finish());
    }
  }

  /**
   * helper method to “consume” the final iteration of the channel, mimicking
   * the returning/throwing behavior of generators.
   *
   * The difference between closing a channel vs finishing a channel is that
   * close will allow calls to continue to drain values from the buffer, while
   * finish will immediately clear the buffer and freeze the channel.
   */
  private finish(): Promise<IteratorResult<T>> {
    if (this.execution == null) {
      return Promise.resolve({ done: true } as IteratorResult<T>);
    }
    const execution = this.execution;
    const error = this.error;
    delete this.execution;
    delete this.error;
    // clear the buffer
    this.buffer = new FixedBuffer(0);
    Object.freeze(this);
    if (error != null) {
      return Promise.reject(error);
    }
    return execution;
  }

  async next(value?: Next): Promise<IteratorResult<T>> {
    if (this.onstart != null && this.onstop != null) {
      this.onstart();
      delete this.onstart;
    }

    if (!this.buffer.empty) {
      const result = { value: this.buffer.remove()!, done: false };
      if (this.pushQueue.length) {
        const push = this.pushQueue.shift()!;
        this.buffer.add(push.value);
        push.resolve(value);
      }
      return result;
    } else if (this.pushQueue.length) {
      const push = this.pushQueue.shift()!;
      const result = { value: push.value, done: false };
      push.resolve(value);
      return result;
    } else if (this.onstop == null) {
      return this.finish();
    } else if (this.pullQueue.length >= MAX_QUEUE_LENGTH) {
      throw new ChannelOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Channel.prototype.next are allowed on a single channel.`,
      );
    }
    return new Promise((resolve, reject) => {
      this.pullQueue.push({ resolve, reject, value });
    });
  }

  async return(value?: Return): Promise<IteratorResult<T>> {
    if (this.onstop == null) {
      return { value: (value as unknown) as T, done: true };
    } else if (this.onstop != null) {
      this.onstop(value);
    }
    this.close();
    return this.finish();
  }

  async throw(error?: any): Promise<IteratorResult<T>> {
    if (this.onstop == null) {
      throw error;
    }
    this.close(error);
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

  next(value?: Next): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("ChannelController missing from controllers WeakMap");
    }
    return controller.next(value);
  }

  return(value?: Return): Promise<IteratorResult<T>> {
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

  // TODO: fix these types
  static race<T>(contenders: Iterable<Contender<T>>): Channel<T> {
    const iters = iterators(contenders);
    return new Channel<T>(async (push, close, stop) => {
      let stopped = false;
      let returned: any;
      stop.then((value) => {
        stopped = true;
        returned = value;
      });
      const finish: Promise<IteratorResult<T>> = stop.then((value) => ({
        value: value as T,
        done: true,
      }));
      try {
        let next: any;
        while (!stopped) {
          const nexts = iters.map((iter) => iter.next(next));
          nexts.push(finish);
          const result = await Promise.race(nexts);
          if (result.done) {
            return result.value;
          }
          next = await push(result.value);
        }
      } catch (err) {
        close(err);
      } finally {
        await Promise.race(
          iters.map(async (iter) => iter.return && iter.return(returned)),
        );
      }
    });
  }

  // TODO: fix these types
  static merge<T>(contenders: Iterable<Contender<T>>): Channel<T> {
    const iters = iterators(contenders);
    return new Channel<T>(async (push, close, stop) => {
      let stopped = false;
      let returned: any;
      stop.then((value) => {
        stopped = true;
        returned = value;
      });
      const finish: Promise<IteratorResult<T>> = stop.then((value) => ({
        value: value as T,
        done: true,
      }));
      return Promise.race(
        iters.map(async (iter) => {
          try {
            let next: any;
            while (!stopped) {
              const result = await Promise.race([finish, iter.next(next)]);
              if (result.done) {
                return result.value;
              }
              next = await push(result.value);
            }
          } catch (err) {
            close(err);
          } finally {
            if (iter.return != null) {
              await iter.return(returned);
            }
          }
        }),
      );
    });
  }
}
