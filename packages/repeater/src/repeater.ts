import { FixedBuffer, RepeaterBuffer } from "./buffers";

export {
  DroppingBuffer,
  FixedBuffer,
  RepeaterBuffer,
  SlidingBuffer,
} from "./buffers";

export const MAX_QUEUE_LENGTH = 1024;

export class RepeaterOverflowError extends Error {
  constructor(message: string) {
    super(message);
    Object.defineProperty(this, "name", {
      value: "RepeaterOverflowError",
      enumerable: false,
    });
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, new.target.prototype);
    } else {
      (this as any).__proto__ = new.target.prototype;
    }

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

export type Push<T, TNext = any> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;

export type Stop<TReturn = any> = Promise<TReturn | undefined> &
  ((error?: any) => void);

export type RepeaterExecutor<T, TReturn = any, TNext = any> = (
  push: Push<T, TNext>,
  stop: Stop<TReturn>,
) => PromiseLike<TReturn> | TReturn;

interface PushOperation<T, TNext> {
  resolve(next?: TNext): void;
  value: PromiseLike<T> | T;
}

interface PullOperation<T, TNext> {
  resolve(result: Promise<IteratorResult<T>>): void;
  reject(err?: any): void;
  value?: TNext;
}

const enum RepeaterState {
  Initial,
  Started,
  Stopped,
  Finished,
}

/**
 * The functionality for repeaters is implemented in this helper class and
 * hidden using a private WeakMap to make repeaters themselves opaque and
 * maximally compatible with async generators.
 */
class RepeaterController<T, TReturn = any, TNext = any> {
  private state: RepeaterState = RepeaterState.Initial;
  // pushQueue and pullQueue will never both contain operations at the same time
  private pushQueue: PushOperation<T, TNext>[] = [];
  private pullQueue: PullOperation<T, TNext>[] = [];
  private onnext?: (value?: TNext) => void;
  // TODO: maybe rename to onreturn
  private onstop?: (value?: PromiseLike<TReturn> | TReturn) => void;
  // pending is continuously reassigned as the repeater is iterated. We use
  // this mechanism to make sure all iterations settle in order.
  private pending?: Promise<IteratorResult<T>>;
  private execution?: Promise<TReturn>;
  private error?: any;

  constructor(
    private executor: RepeaterExecutor<T, TReturn, TNext>,
    private buffer: RepeaterBuffer<PromiseLike<T> | T>,
  ) {}

  /**
   * This method runs synchronously the first time next is called.
   *
   * Advances state to RepeaterState.Started.
   */
  private execute(): void {
    if (this.state >= RepeaterState.Started) {
      return;
    }

    this.state = RepeaterState.Started;
    const push: Push<T> = this.push.bind(this);
    const stop: Stop = this.stop.bind(this) as Stop<TReturn>;
    const stopP = new Promise<TReturn>((onstop) => (this.onstop = onstop));
    stop.then = stopP.then.bind(stopP);
    stop.catch = stopP.catch.bind(stopP);
    stop.finally = stopP.finally.bind(stopP);
    // Errors which occur in the executor take precedence over those passed to
    // this.stop, so calling this.stop with the caught error would be redundant.
    try {
      this.execution = Promise.resolve(this.executor(push, stop));
    } catch (err) {
      this.execution = Promise.reject(err);
    }

    this.execution.catch(() => this.stop());
  }

  /**
   * A helper method which is called when a promise passed to push rejects.
   * Rejections which settle after stop are ignored. This behavior is useful
   * when you have yielded a pending promise but want to finish instead.
   */
  private async reject(err: any): Promise<IteratorResult<T>> {
    if (this.state >= RepeaterState.Stopped) {
      const value = await this.execution;
      return { value, done: true };
    }

    this.finish().catch(() => {});
    throw err;
  }

  /**
   * A helper method which unwraps promises passed to push. Unwrapping promises
   * prevents types of Repeater<Promise<any>> and mimics the awaiting/unwrapping
   * behavior of async generators where `yield` is equivalent to `yield await`.
   */
  private unwrap(value: PromiseLike<T> | T): Promise<IteratorResult<T>> {
    if (this.pending == null) {
      this.pending = Promise.resolve(value).then(
        (value) => {
          return { value, done: false };
        },
        (err) => this.reject(err),
      );
    } else {
      this.pending = this.pending.then(
        (prev) => {
          if (prev.done) {
            return { value: undefined, done: true };
          }

          return Promise.resolve(value).then(
            (value) => ({ value, done: false }),
            (err) => this.reject(err),
          );
        },
        () => ({ value: undefined, done: true }),
      );
    }

    return this.pending;
  }

  /**
   * A helper method which “consumes” the final iteration of the repeater,
   * mimicking the returning/throwing behavior of generators.
   *
   * The difference between stopping a repeater vs finishing a repeater is that
   * stopping a repeater allows next to continue draining values from the
   * pushQueue/buffer, while finishing a repeater will clear all queues/buffers
   * and end all iteration.
   *
   * Advances state to RepeaterState.Finished.
   */
  private finish(): Promise<IteratorResult<T>> {
    const execution = Promise.resolve(this.execution);
    const error = this.error;
    if (this.state < RepeaterState.Finished) {
      if (this.state < RepeaterState.Stopped) {
        this.stop();
      }

      this.state = RepeaterState.Finished;
      this.pushQueue = [];
      this.buffer = new FixedBuffer(0);
      delete this.error;
      delete this.execution;
    }

    if (this.pending == null) {
      this.pending = execution.then((value) => {
        if (error == null) {
          return { value, done: true };
        }

        throw error;
      });
    } else {
      this.pending = this.pending.then(
        (prev) => {
          if (prev.done) {
            return { value: undefined, done: true };
          }

          return execution.then((value) => {
            if (error == null) {
              return { value, done: true };
            }

            throw error;
          });
        },
        () => ({ value: undefined, done: true }),
      );
    }

    return this.pending;
  }

  /**
   * This method is bound and passed to the executor as `push`.
   */
  private push(value: PromiseLike<T> | T): Promise<TNext | void> {
    Promise.resolve(value).catch(() => {});
    if (this.state >= RepeaterState.Stopped) {
      return Promise.resolve();
    } else if (this.pullQueue.length) {
      const pull = this.pullQueue.shift()!;
      pull.resolve(this.unwrap(value));
      if (this.pullQueue.length) {
        return Promise.resolve(this.pullQueue[0].value);
      }

      return new Promise((resolve) => (this.onnext = resolve));
    } else if (!this.buffer.full) {
      this.buffer.add(value);
      return Promise.resolve();
    } else if (this.pushQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to push are allowed on a single repeater.`,
      );
    }

    return new Promise((resolve) => this.pushQueue.push({ resolve, value }));
  }

  /**
   * This method is bound and passed to the executor as `stop`.
   *
   * Advances state to RepeaterState.Stopped.
   */
  private stop(error?: any): void {
    if (this.state >= RepeaterState.Stopped) {
      return;
    }

    if (this.onnext !== undefined) {
      this.onnext();
    }

    if (this.onstop !== undefined) {
      this.onstop();
    }

    this.state = RepeaterState.Stopped;
    this.error = error;
    for (const push of this.pushQueue) {
      push.resolve();
    }

    // If the pullQueue contains operations, the pushQueue and buffer is
    // necessarily empty, so we don‘t have to worry about this.finish clearing
    // the pushQueue or buffer.
    for (const pull of this.pullQueue) {
      pull.resolve(this.finish());
    }

    this.pullQueue = [];
  }

  next(value?: TNext): Promise<IteratorResult<T>> {
    if (this.state === RepeaterState.Initial) {
      this.execute();
    }

    if (this.onnext !== undefined) {
      this.onnext(value);
      delete this.onnext;
    }

    if (!this.buffer.empty) {
      const result = this.unwrap(this.buffer.remove());
      if (this.pushQueue.length) {
        const push = this.pushQueue.shift()!;
        this.buffer.add(push.value);
        this.onnext = push.resolve;
      }

      return result;
    } else if (this.pushQueue.length) {
      const push = this.pushQueue.shift()!;
      this.onnext = push.resolve;
      return this.unwrap(push.value);
    } else if (this.state >= RepeaterState.Stopped) {
      return this.finish();
    } else if (this.pullQueue.length >= MAX_QUEUE_LENGTH) {
      throw new RepeaterOverflowError(
        `No more than ${MAX_QUEUE_LENGTH} pending calls to Repeater.prototype.next are allowed on a single repeater.`,
      );
    }

    return new Promise((resolve, reject) => {
      this.pullQueue.push({ resolve, reject, value });
    });
  }

  return(value?: PromiseLike<TReturn> | TReturn): Promise<IteratorResult<T>> {
    if (this.state >= RepeaterState.Finished) {
      if (this.pending == null) {
        this.pending = Promise.resolve({ value, done: true });
      } else {
        this.pending = this.pending
          .then(() => value)
          .then((value) => ({ value, done: true }));
      }

      return this.pending;
    } else if (this.onstop != null) {
      this.onstop(value);
    }

    this.stop();
    return this.finish();
  }

  throw(error: any): Promise<IteratorResult<T>> {
    if (this.state >= RepeaterState.Finished) {
      if (this.pending == null) {
        this.pending = Promise.reject(error);
      } else {
        this.pending = this.pending.then(
          () => Promise.reject(error),
          () => Promise.reject(error),
        );
      }

      return this.pending;
    }

    this.stop(error);
    return this.finish();
  }
}

// TODO: parameterize TReturn
type Contender<T> = AsyncIterable<T> | Iterable<T> | PromiseLike<any>;

function iterators<T>(
  contenders: Iterable<Contender<T>>,
): (AsyncIterator<T> | Iterator<T>)[] {
  const iters: (AsyncIterator<T> | Iterator<T>)[] = [];
  for (const contender of contenders) {
    if (typeof (contender as any)[Symbol.asyncIterator] === "function") {
      iters.push((contender as AsyncIterable<T>)[Symbol.asyncIterator]());
    } else if (typeof (contender as any)[Symbol.iterator] === "function") {
      iters.push((contender as Iterable<T>)[Symbol.iterator]());
    } else {
      iters.push(
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        new Repeater((_, stop) => (stop(), contender)),
      );
    }
  }

  return iters;
}

type RepeaterControllerMap<T = any, TReturn = any, TNext = any> = WeakMap<
  Repeater<T, TReturn, TNext>,
  RepeaterController<T, TReturn, TNext>
>;

const controllers: RepeaterControllerMap = new WeakMap();

export class Repeater<T, TReturn = any, TNext = any> {
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>,
    buffer: RepeaterBuffer<PromiseLike<T> | T> = new FixedBuffer(0),
  ) {
    controllers.set(
      this,
      new RepeaterController<T, TReturn, TNext>(executor, buffer),
    );
  }

  next(value?: TNext): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.next(value);
  }

  return(value?: PromiseLike<TReturn> | TReturn): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.return(value);
  }

  throw(error?: any): Promise<IteratorResult<T>> {
    const controller = controllers.get(this);
    if (controller == null) {
      throw new Error("RepeaterController missing from controllers WeakMap");
    }

    return controller.throw(error);
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  // TODO: rethink the done value for each of the combinators
  // TODO: remove eslint-disable comments once no-dupe-class-members is fixed
  // https://github.com/typescript-eslint/typescript-eslint/issues/291
  // TODO: use prettier-ignore-start/prettier-ignore-end once it’s implemented
  // https://github.com/prettier/prettier/issues/5287
  // TODO: stop using overloads once we have variadic kinds
  // https://github.com/Microsoft/TypeScript/issues/5453
  /* eslint-disable no-dupe-class-members */
  static race(contenders: []): Repeater<never>;
  static race<T>(contenders: Iterable<Contender<T>>): Repeater<T>;
  // prettier-ignore
  static race<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<T1 | T2>;
  // prettier-ignore
  static race<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<T1 | T2 | T3>;
  // prettier-ignore
  static race<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<T1 | T2 | T3 | T4>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<T1 | T2 | T3 | T4 | T5>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
  // prettier-ignore
  static race<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
  static race<T>(contenders: Iterable<Contender<T>>): Repeater<T> {
    const iters = iterators(contenders);
    return new Repeater<T>(async (push, stop) => {
      if (!iters.length) {
        stop();
        return;
      }

      let stopped = false;
      let returned: any;
      const finish: Promise<IteratorResult<T>> = stop.then((value) => {
        stopped = true;
        returned = value;
        return { value, done: true };
      });
      try {
        let result: IteratorResult<T> | undefined;
        while (!stopped) {
          const results = iters.map((iter) => iter.next());
          for (const result1 of results) {
            Promise.resolve(result1)
              .then((result1) => {
                if (result1.done && result == null) {
                  stop();
                  result = result1;
                }
              })
              .catch(stop);
          }

          results.unshift(finish);
          const result1 = await Promise.race(results);
          if (result1.done && result == null) {
            result = result1;
            break;
          }

          await push(result1.value as T);
        }

        return result && result.value;
      } catch (err) {
        stop(err);
      } finally {
        stop();
        await Promise.race<any>(
          iters.map((iter) => iter.return && iter.return(returned)),
        );
      }
    });
  }

  static merge(contenders: []): Repeater<never>;
  static merge<T>(contenders: Iterable<Contender<T>>): Repeater<T>;
  // prettier-ignore
  static merge<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<T1 | T2>;
  // prettier-ignore
  static merge<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<T1 | T2 | T3>;
  // prettier-ignore
  static merge<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<T1 | T2 | T3 | T4>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<T1 | T2 | T3 | T4 | T5>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
  // prettier-ignore
  static merge<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
  static merge<T>(contenders: Iterable<Contender<T>>): Repeater<T> {
    const iters = iterators(contenders);
    return new Repeater<T>(async (push, stop) => {
      if (!iters.length) {
        stop();
        return;
      }

      let stopped = false;
      let returned: any;
      const finish: Promise<IteratorResult<T>> = stop.then((value) => {
        stopped = true;
        returned = value;
        return { value, done: true };
      });
      let value: any | undefined;
      await Promise.all(
        iters.map(async (iter) => {
          try {
            while (!stopped) {
              const result: IteratorResult<T> = await Promise.race([
                finish,
                iter.next(),
              ]);
              if (result.done) {
                value = result.value;
                return;
              }

              await push(result.value as T);
            }
          } catch (err) {
            stop(err);
          } finally {
            if (iter.return != null) {
              await iter.return(returned);
            }
          }
        }),
      );
      stop();
      return value;
    });
  }

  static zip(contenders: []): Repeater<never, []>;
  static zip<T>(contenders: Iterable<Contender<T>>): Repeater<T[]>;
  // prettier-ignore
  static zip<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<[T1, T2]>;
  // prettier-ignore
  static zip<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<[T1, T2, T3]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<[T1, T2, T3, T4]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<[T1, T2, T3, T4, T5]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<[T1, T2, T3, T4, T5, T6]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<[T1, T2, T3, T4, T5, T6, T7]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
  // prettier-ignore
  static zip<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
  static zip<T>(contenders: Iterable<Contender<T>>): Repeater<T[]> {
    const iters = iterators(contenders);
    return new Repeater<T[]>(async (push, stop) => {
      if (!iters.length) {
        stop();
        return [];
      }

      let stopped = false;
      let returned: any;
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
        stop(err);
      } finally {
        stop();
        if (!stopped) {
          await Promise.all<any>(
            iters.map((iter) => iter.return && iter.return(returned)),
          );
        }
      }
    });
  }

  static latest(contenders: []): Repeater<never, []>;
  static latest<T>(contenders: Iterable<Contender<T>>): Repeater<T[]>;
  // prettier-ignore
  static latest<T1, T2>(contenders: [Contender<T1>, Contender<T2>]): Repeater<[T1, T2]>;
  // prettier-ignore
  static latest<T1, T2, T3>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>]): Repeater<[T1, T2, T3]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>]): Repeater<[T1, T2, T3, T4]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>]): Repeater<[T1, T2, T3, T4, T5]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>]): Repeater<[T1, T2, T3, T4, T5, T6]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>]): Repeater<[T1, T2, T3, T4, T5, T6, T7]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7, T8>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7, T8, T9>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
  // prettier-ignore
  static latest<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(contenders: [Contender<T1>, Contender<T2>, Contender<T3>, Contender<T4>, Contender<T5>, Contender<T6>, Contender<T7>, Contender<T8>, Contender<T9>, Contender<T10>]): Repeater<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
  static latest<T>(contenders: Iterable<Contender<T>>): Repeater<T[]> {
    const iters = iterators(contenders);
    return new Repeater<T[]>(async (push, stop) => {
      if (!iters.length) {
        stop();
        return [];
      }

      let stopped = false;
      let returned: any;
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
      const result = await Promise.all(
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
            stop(err);
          } finally {
            if (iter.return != null) {
              await iter.return(returned);
            }
          }
        }),
      );
      stop();
      return result;
    });
  }
  /* eslint-enable no-dupe-class-members */
}
