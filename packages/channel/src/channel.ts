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

// The current definition of the AsyncIterator interface found in typescript
// allows "any" to be passed to next/return, so we use these type aliases to
// keep track of the arguments as they flow through channels.
// Yield is the argument passed to AsyncIterator.next
// Return is the argument passed to AsyncIterator.return
type Yield = any;
type Return = any;

interface PushOperation<T> {
  resolve(next?: Yield): void;
  value: Promise<T> | T;
}

interface PullOperation<T> {
  resolve(result: Promise<IteratorResult<T>>): void;
  reject(err?: any): void;
  value?: Yield;
}

export type ChannelExecutor<T> = (
  push: (value: Promise<T> | T) => Promise<Yield | void>,
  close: (error?: any) => void,
  stop: Promise<Return | void>,
) => Promise<T | void> | T | void;

/**
 * The functionality for channels is implemented in this helper class and
 * hidden using a private WeakMap to make channels themselves opaque and
 * maximally compatible with the AsyncIterableIterator interface.
 */
class ChannelController<T> implements AsyncIterator<T> {
  // pushQueue and pullQueue will never both contain operations at the same time
  private pushQueue: PushOperation<T>[] = [];
  private pullQueue: PullOperation<T>[] = [];

  // Because we delete the following properties after they are used, the
  // presence or absence of these properties indicates the current state of the
  // controller.

  // if onstart == null, the channel has started
  private onstart?: () => void;
  // if onstop == null, the channel has stopped/closed
  private onstop?: (value?: Return) => void;
  // if execution == null, the channel is finished and frozen
  private execution?: Promise<IteratorResult<T>>;
  // if error != null, the next iteration will result in a promise rejection
  private error?: any;

  constructor(
    executor: ChannelExecutor<T>,
    private buffer: ChannelBuffer<Promise<T> | T>,
  ) {
    const start = new Promise<void>((onstart) => (this.onstart = onstart));
    const push = this.push.bind(this);
    const close = this.close.bind(this);
    const stop = new Promise<Return | void>((onstop) => (this.onstop = onstop));
    this.execution = start.then(async () => {
      try {
        const value = await executor(push, close, stop);
        this.close();
        return { value, done: true } as IteratorResult<T>;
      } catch (err) {
        if (this.onstop == null) {
          throw err;
        }
        this.close(err);
        return { done: true } as IteratorResult<T>;
      }
    });
  }

  private async unwrap(value: Promise<T> | T): Promise<IteratorResult<T>> {
    try {
      value = await value;
      return { value, done: false };
    } catch (err) {
      this.close(err);
      return this.finish();
    }
  }

  // TODO: allow push to push a promise
  private push(value: Promise<T> | T): Promise<Yield | void> {
    value = Promise.resolve(value);
    if (this.onstop == null) {
      Promise.resolve(value).catch(() => {});
      return Promise.resolve();
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      pull.resolve(this.unwrap(value));
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
    if (this.onstart != null) {
      // This branch executes if and only if return is called before the
      // channel is started.
      this.execution = Promise.resolve({ done: true } as IteratorResult<T>);
    }
    delete this.onstart;
    this.error = error;
    for (const push of this.pushQueue) {
      push.resolve();
    }
    this.pushQueue = [];
    Object.freeze(this.pushQueue);
    const pullQueue = this.pullQueue;
    this.pullQueue = [];
    Object.freeze(this.pullQueue);
    // Calling this.finish freezes the controller so we resolve pull operations
    // last. If the pullQueue contains operations, the buffer and pushQueue are
    // necessarily empty, so we don‘t have to worry about this.finish clearing
    // the buffer.
    for (const pull of pullQueue) {
      pull.resolve(this.finish());
    }
  }

  /**
   * helper method to “consume” the final iteration of the channel, mimicking
   * the returning/throwing behavior of generators.
   *
   * The difference between closing a channel vs finishing a channel is that
   * close will allow next to continue to drain values from the buffer, while
   * finish will clear the buffer and freeze the channel immediately.
   */
  private async finish(): Promise<IteratorResult<T>> {
    if (this.execution == null) {
      return { done: true } as IteratorResult<T>;
    }
    const execution = this.execution;
    const error = this.error;
    delete this.execution;
    delete this.error;
    // clear the buffer
    this.buffer = new FixedBuffer(0);
    Object.freeze(this);
    const result = await execution;
    if (error != null) {
      throw error;
    }
    return result;
  }

  async next(value?: Yield): Promise<IteratorResult<T>> {
    if (this.onstart != null && this.onstop != null) {
      this.onstart();
      delete this.onstart;
    }

    if (!this.buffer.empty) {
      const result = this.unwrap(this.buffer.remove());
      if (this.pushQueue.length) {
        const push = this.pushQueue.shift()!;
        this.buffer.add(push.value);
        push.resolve(value);
      }
      return result;
    } else if (this.pushQueue.length) {
      // This branch only really executes if we’re using a FixedBuffer with
      // zero capacity (the default buffer passed to the constructor), because
      // then the buffer is both empty and full at the same time.
      const push = this.pushQueue.shift()!;
      const result = this.unwrap(push.value);
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
      return { value, done: true };
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

function constant<T>(value: Promise<T> | T): AsyncIterator<T> {
  return {
    next(): Promise<IteratorResult<T>> {
      return Promise.resolve(value).then((value) => ({ value, done: true }));
    },
    return(): Promise<IteratorResult<T>> {
      return Promise.resolve(value).then((value) => ({ value, done: true }));
    },
  };
}

export type Contender<T> = AsyncIterable<T> | Iterable<T> | Promise<T> | T;

function iterators<T>(
  contenders: Iterable<Contender<T>>,
): (Iterator<T> | AsyncIterator<T>)[] {
  const iters: (Iterator<T> | AsyncIterator<T>)[] = [];
  for (const contender of contenders) {
    if (typeof (contender as any)[Symbol.asyncIterator] === "function") {
      iters.push((contender as AsyncIterable<any>)[Symbol.asyncIterator]());
    } else if (typeof (contender as any)[Symbol.iterator] === "function") {
      iters.push((contender as Iterable<any>)[Symbol.iterator]());
    } else {
      iters.push(constant(contender as Promise<T> | T));
    }
  }
  return iters;
}

type ChannelControllerMap<T = any> = WeakMap<Channel<T>, ChannelController<T>>;

const controllers: ChannelControllerMap = new WeakMap();

export class Channel<T> implements AsyncIterableIterator<T> {
  constructor(
    executor: ChannelExecutor<T>,
    buffer: ChannelBuffer<Promise<T> | T> = new FixedBuffer(0),
  ) {
    controllers.set(this, new ChannelController(executor, buffer));
  }

  next(value?: Yield): Promise<IteratorResult<T>> {
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

  // TODO: remove eslint-disable comments once no-dupe-class-members is fixed
  // https://github.com/typescript-eslint/typescript-eslint/issues/291
  // TODO: use prettier-ignore-start once it’s implemented
  // https://github.com/prettier/prettier/issues/5287
  // TODO: stop using overloads once we have variadic kinds
  // https://github.com/Microsoft/TypeScript/issues/5453

  /* eslint-disable no-dupe-class-members */
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Channel<T1 | T2 | T3 | T4 | T5 | T6>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Channel<T1 | T2 | T3 | T4 | T5>;
  // prettier-ignore
  static race<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Channel<T1 | T2 | T3 | T4>;
  // prettier-ignore
  static race<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Channel<T1 | T2 | T3>;
  // prettier-ignore
  static race<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Channel<T1 | T2>;
  static race<T>(contenders: Contender<T>[]): Channel<T>;
  static race(contenders: []): Channel<void>;
  static race<T>(contenders: Iterable<Contender<T>>): Channel<T> {
    const iters = iterators(contenders);
    return new Channel<T>(async (push, close, stop) => {
      if (!iters.length) {
        return;
      }
      let stopped = false;
      let returned: Return;
      const finish: Promise<IteratorResult<T>> = stop.then((value) => {
        stopped = true;
        returned = value;
        return { value, done: true };
      });
      try {
        while (!stopped) {
          const results = iters.map((iter) => iter.next());
          results.push(finish);
          const result = await Promise.race(results);
          if (result.done) {
            return result.value;
          }
          await push(result.value);
        }
      } catch (err) {
        close(err);
      } finally {
        await Promise.race<any>(
          iters.map((iter) => iter.return && iter.return(returned)),
        );
      }
    });
  }
  /* eslint-enable no-dupe-class-members */

  /* eslint-disable no-dupe-class-members */
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Channel<T1 | T2 | T3 | T4 | T5 | T6 | T7>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Channel<T1 | T2 | T3 | T4 | T5 | T6>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Channel<T1 | T2 | T3 | T4 | T5>;
  // prettier-ignore
  static merge<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Channel<T1 | T2 | T3 | T4>;
  // prettier-ignore
  static merge<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Channel<T1 | T2 | T3>;
  // prettier-ignore
  static merge<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Channel<T1 | T2>;
  static merge<T>(contenders: Contender<T>[]): Channel<T>;
  static merge(contenders: []): Channel<void>;
  static merge<T>(contenders: Iterable<Contender<T>>): Channel<T> {
    const iters = iterators(contenders);
    return new Channel<T>(async (push, close, stop) => {
      if (!iters.length) {
        return;
      }
      let stopped = false;
      let returned: Return;
      const finish: Promise<IteratorResult<T>> = stop.then((value) => {
        stopped = true;
        returned = value;
        return { value, done: true };
      });
      let value: T | undefined;
      await Promise.all(
        iters.map(async (iter) => {
          try {
            while (!stopped) {
              const result = await Promise.race([finish, iter.next()]);
              if (result.done) {
                value = result.value;
                return;
              }
              await push(result.value);
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
      return value;
    });
  }
  /* eslint-enable no-dupe-class-members */

  /* eslint-disable no-dupe-class-members */
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Channel<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Channel<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Channel<[T1, T2, T3, T4, T5, T6, T7, T8]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Channel<[T1, T2, T3, T4, T5, T6, T7]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Channel<[T1, T2, T3, T4, T5, T6]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Channel<[T1, T2, T3, T4, T5]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Channel<[T1, T2, T3, T4]>;
  // prettier-ignore
  static zip<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Channel<[T1, T2, T3]>;
  // prettier-ignore
  static zip<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Channel<[T1, T2]>;
  static zip<T>(contenders: Contender<T>[]): Channel<T[]>;
  static zip(contenders: []): Channel<[]>;
  static zip<T>(contenders: Iterable<Contender<T>>): Channel<T[]> {
    const iters = iterators(contenders);
    return new Channel<T[]>(async (push, close, stop) => {
      if (!iters.length) {
        return [];
      }
      let stopped = false;
      let returned: Return;
      stop.then((value) => {
        stopped = true;
        returned = value;
      });
      try {
        while (!stopped) {
          const resultsP = Promise.all(iters.map((iter) => iter.next()));
          await Promise.race([stop, resultsP]);
          if (stopped) {
            return Promise.all(
              iters.map(async (iter) => {
                if (iter.return == null) {
                  return returned;
                }
                return (await iter.return(returned)).value;
              }),
            );
          }
          const results = await resultsP;
          const values = results.map((result) => result.value);
          if (results.some((result) => result.done)) {
            return values;
          }
          await push(values);
        }
      } catch (err) {
        close(err);
      } finally {
        if (!stopped) {
          await Promise.all<any>(
            iters.map((iter) => iter.return && iter.return(returned)),
          );
        }
      }
    });
  }
  /* eslint-enable no-dupe-class-members */

  /* eslint-disable no-dupe-class-members */
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Channel<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Channel<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Channel<[T1, T2, T3, T4, T5, T6, T7, T8]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Channel<[T1, T2, T3, T4, T5, T6, T7]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Channel<[T1, T2, T3, T4, T5, T6]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Channel<[T1, T2, T3, T4, T5]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Channel<[T1, T2, T3, T4]>;
  // prettier-ignore
  static latest<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Channel<[T1, T2, T3]>;
  // prettier-ignore
  static latest<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Channel<[T1, T2]>;
  static latest<T>(contenders: Contender<T>[]): Channel<T[]>;
  static latest(contenders: []): Channel<[]>;
  static latest<T>(contenders: Iterable<Contender<T>>): Channel<T[]> {
    const iters = iterators(contenders);
    return new Channel<T[]>(async (push, close, stop) => {
      if (!iters.length) {
        return [];
      }
      let stopped = false;
      let returned: Return;
      const finish = stop.then((value) => {
        stopped = true;
        returned = value;
        return { value, done: true };
      });
      const resultsP = Promise.all(iters.map((iter) => iter.next()));
      await Promise.race([stop, resultsP]);
      if (stopped) {
        return Promise.all(
          iters.map(async (iter) => {
            if (iter.return == null) {
              return returned;
            }
            return (await iter.return(returned)).value;
          }),
        );
      }
      const results = await resultsP;
      const values = results.map((result) => result.value);
      if (results.every((result) => result.done)) {
        return values;
      }
      await push(values.slice());
      return Promise.all(
        iters.map(async (iter, i) => {
          if (results[i].done) {
            return results[i].value;
          }
          try {
            while (!stopped) {
              const result = await Promise.race([finish, iter.next()]);
              if (result.done) {
                return result.value;
              }
              values[i] = result.value;
              await push(values.slice());
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
  /* eslint-enable no-dupe-class-members */
}
