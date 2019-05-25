import {
  Channel,
  ChannelOverflowError,
  DroppingBuffer,
  FixedBuffer,
  MAX_QUEUE_LENGTH,
  SlidingBuffer,
} from "../index";

import { delayPromise } from "../_testutils";

// TODO: create a jest helper to help us test AsyncIterators
describe("Channel", () => {
  test("sync pushes", async () => {
    const chan = new Channel<number>((push) => {
      push(1);
      push(2);
      push(3);
    });
    // because close happens synchronously and there is no buffer, only the
    // first value is pulled and the rest are dropped.
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async pushes", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync pushing promises", async () => {
    const chan = new Channel<number>((push) => {
      push(Promise.resolve(1));
      push(Promise.resolve(2));
      push(Promise.resolve(3));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async pushing promises", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.resolve(3));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync pushing delayed promises", async () => {
    const chan = new Channel<number>((push) => {
      push(delayPromise(50, 1));
      push(delayPromise(50, 1));
      push(delayPromise(50, 1));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async pushing delayed promises", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(delayPromise(50, 1));
      await push(delayPromise(50, 2));
      await push(delayPromise(50, 3));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync pushing promise rejection", async () => {
    const error = new Error("sync pushing promise rejection");
    const chan = new Channel<number>((push) => {
      push(delayPromise(50, 1, error));
    });

    // error is swallowed because channel closes when executor returns
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync pushing promise rejection after push", async () => {
    const error = new Error("sync pushing promise rejection after push");
    const chan = new Channel<number>(async (push, _, stop) => {
      push(delayPromise(50, 1));
      push(delayPromise(50, 2, error));
      push(delayPromise(50, 3));
      await stop;
    });

    // error is swallowed because channel closes when executor returns
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async pushing promise rejection", async () => {
    const error = new Error("async pushing promise rejection");
    const chan = new Channel<number>(async (push) => {
      await push(delayPromise(50, 1));
      await push(delayPromise(50, 2, error));
      await push(delayPromise(50, 3));
    });

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync pushing promise rejection with buffer", async () => {
    const error = new Error("sync pushing promise rejection with buffer");
    const chan = new Channel<number>(async (push, _, stop) => {
      push(delayPromise(50, 1));
      push(delayPromise(50, 2, error));
      push(delayPromise(50, 3));
      await stop;
    }, new FixedBuffer(100));

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async pushing promise rejection with buffer", async () => {
    const error = new Error("async pushing promise rejection with buffer");
    const chan = new Channel<number>(async (push, _, stop) => {
      await push(delayPromise(50, 1));
      await push(delayPromise(50, 2, error));
      await push(delayPromise(50, 3));
      await stop;
    }, new FixedBuffer(100));

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync return", async () => {
    const chan = new Channel<number>(() => -1);
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async return", async () => {
    const chan = new Channel<number>(() => Promise.resolve(-1));
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync pushes and return", async () => {
    const chan = new Channel<number>((push) => {
      push(1);
      push(2);
      push(3);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async pushes and return", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync return value with close", async () => {
    const chan = new Channel<number>((push, close) => {
      push(1);
      push(2);
      push(3);
      close();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async return value with close", async () => {
    const chan = new Channel<number>(async (push, close) => {
      await push(1);
      await push(2);
      await push(3);
      close();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync error in executor", async () => {
    const error = new Error("sync error in executor");
    const chan = new Channel<number>(() => {
      throw error;
    });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async error in executor", async () => {
    const error = new Error("async error in executor");
    const chan = new Channel<number>(async () => {
      throw error;
    });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync error in executor with pushes", async () => {
    const error = new Error("sync error in executor with pushes");
    const chan = new Channel<number>((push) => {
      push(1);
      push(2);
      push(3);
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async error in executor with pushes", async () => {
    const error = new Error("async error in executor with pushes");
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync error in executor after close is called", async () => {
    const error = new Error("sync error in executor after close is called");
    const chan = new Channel<number>((push, close) => {
      push(1);
      close();
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async error in executor after close is called", async () => {
    const error = new Error("async error in executor after close is called");
    const chan = new Channel<number>(async (push, close) => {
      await push(1);
      close();
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sync error in executor after close is called with error", async () => {
    const error1 = new Error(
      "sync error in executor after close is called with error 1",
    );
    const error2 = new Error(
      "sync error in executor after close is called with error 2",
    );
    const chan = new Channel<number>((push, close) => {
      push(1);
      close(error1);
      throw error2;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error2);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async error in executor after close is called with error", async () => {
    const error1 = new Error(
      "async error in executor after close is called with error 1",
    );
    const error2 = new Error(
      "async error in executor after close is called with error 2",
    );
    const chan = new Channel<number>(async (push, close, stop) => {
      await push(1);
      await push(2);
      close(error1);
      await stop;
      throw error2;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error2);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return value after close is called with error", async () => {
    const error = new Error("sync return value after close with error");
    const chan = new Channel<number>((push, close) => {
      push(1);
      close(error);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return rejected promise from executor", async () => {
    const error = new Error("return rejected promise from executor");
    const chan = new Channel<number>(() => Promise.reject(error));
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return rejected promise from executor with pushes", async () => {
    const error = new Error(
      "return rejected promise from executor with pushes",
    );
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      return Promise.reject(error);
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("next then push avoids buffer", async () => {
    const buffer = new FixedBuffer<number>(100);
    const spy = jest.spyOn(buffer, "add");
    let push: (value: number) => Promise<any>;
    const chan = new Channel(async (push1) => {
      push = push1;
      push(-1);
      await new Promise(() => {});
    }, buffer);
    // the buffer is never hit because channels execute lazily
    await expect(chan.next()).resolves.toEqual({ value: -1, done: false });
    const result = chan.next();
    push!(2);
    expect(buffer.empty).toBe(true);
    expect(spy).toHaveBeenCalledTimes(0);
    await expect(result).resolves.toEqual({ value: 2, done: false });
  });

  test("pushes resolve to value passed to next", async () => {
    let push: (value: number) => Promise<number | void>;
    const chan = new Channel<number>(async (push1) => {
      push = push1;
      await new Promise(() => {});
    });
    const result = chan.next(-1);
    // push is only set when the channel is primed so we have to wait for the executor to run for the first time
    await Promise.resolve();
    const push1 = push!(1);
    await expect(push1).resolves.toEqual(-1);
    await expect(result).resolves.toEqual({ value: 1, done: false });
    const push2 = push!(2);
    await expect(chan.next(-2)).resolves.toEqual({ value: 2, done: false });
    await expect(push2).resolves.toEqual(-2);
  });

  test("pushes resolve to undefined when using a buffer", async () => {
    const mock = jest.fn();
    let push: (value: number) => Promise<number | void>;
    const chan = new Channel<number>(async (push1) => {
      push = push1;
      await expect(push(1)).resolves.toEqual(-1);
      await expect(push(2)).resolves.toBeUndefined();
      await expect(push(3)).resolves.toBeUndefined();
      await expect(push(4)).resolves.toBeUndefined();
      await expect(push(5)).resolves.toBeUndefined();
      mock();
      await new Promise(() => {});
    }, new FixedBuffer(3));
    await expect(chan.next(-1)).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next(-2)).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next(-3)).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next(-4)).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next(-5)).resolves.toEqual({ value: 5, done: false });
    const push6 = push!(6);
    const push7 = push!(7);
    const push8 = push!(8);
    const push9 = push!(9);
    await expect(chan.next(-6)).resolves.toEqual({ value: 6, done: false });
    await expect(chan.next(-7)).resolves.toEqual({ value: 7, done: false });
    await expect(chan.next(-8)).resolves.toEqual({ value: 8, done: false });
    await expect(chan.next(-9)).resolves.toEqual({ value: 9, done: false });
    await expect(push6).resolves.toBeUndefined();
    await expect(push7).resolves.toBeUndefined();
    await expect(push8).resolves.toBeUndefined();
    await expect(push9).resolves.toEqual(-6);
    expect(mock).toHaveBeenCalled();
  });

  test("pushes throw when buffer and push queue are full", async () => {
    const bufferLength = 3;
    let push: (value: number) => Promise<any>;
    const chan = new Channel<number>(async (push1, _, stop) => {
      push = push1;
      push(-1);
      await stop;
    }, new FixedBuffer(bufferLength));
    // prime the channel
    await expect(chan.next()).resolves.toEqual({ value: -1, done: false });
    for (let i = 0; i < bufferLength; i++) {
      await expect(push!(i)).resolves.toBeUndefined();
    }
    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      push!(i);
    }
    expect(() => push(-1)).toThrow(ChannelOverflowError);
    expect(() => push(-2)).toThrow(ChannelOverflowError);
  });

  test("next throws when pull queue is full", async () => {
    const chan = new Channel(async () => {
      await new Promise(() => {});
    }, new FixedBuffer(3));
    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      chan.next();
    }
    await expect(chan.next()).rejects.toBeInstanceOf(ChannelOverflowError);
    await expect(chan.next()).rejects.toBeInstanceOf(ChannelOverflowError);
  });

  test("dropping buffer", async () => {
    const chan = new Channel<number>((push, close) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      close();
    }, new DroppingBuffer(3));
    const result: number[] = [];
    await expect(chan.next()).resolves.toEqual({ value: 0, done: false});
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false});
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false});
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false});
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sliding buffer", async () => {
    const chan = new Channel<number>((push, close) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      close();
    }, new SlidingBuffer(3));
    await expect(chan.next()).resolves.toEqual({ value: 0, done: false});
    await expect(chan.next()).resolves.toEqual({ value: 97, done: false});
    await expect(chan.next()).resolves.toEqual({ value: 98, done: false});
    await expect(chan.next()).resolves.toEqual({ value: 99, done: false});
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("executor doesn not run if channel is ignored", async () => {
    const mock = jest.fn();
    new Channel(() => mock());
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("early break", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = jest.spyOn(chan, "return");
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        break;
      }
    }
    expect(result).toEqual([1, 2, 3]);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("early throw", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = jest.spyOn(chan, "return");
    const error = new Error("early throw");
    const result: number[] = [];
    await expect(
      (async () => {
        for await (const num of chan) {
          result.push(num);
          if (num === 3) {
            throw error;
          }
        }
      })(),
    ).rejects.toBe(error);
    expect(result).toEqual([1, 2, 3]);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      return -1;
    });
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await expect(chan.return()).resolves.toEqual({ value: -1, done: true });
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method before channel is started", async () => {
    const mock = jest.fn();
    const chan = new Channel(() => mock());
    await expect(chan.return()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("return method blows away the buffer", async () => {
    const chan = new Channel<number>(async (push, _, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      await stop;
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.return()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method with value", async () => {
    const chan = new Channel<number>(async (push, _, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await expect(stop).resolves.toEqual(-1);
      return -2;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.return(-1)).resolves.toEqual({ value: -2, done: true });
    await expect(chan.return()).resolves.toEqual({ done: true });
    await expect(chan.return(-1)).resolves.toEqual({ value: -1, done: true });
  });

  test("throw method", async () => {
    const chan = new Channel<number>(async (push, _, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      await stop;
    });
    const result: number[] = [];
    const error = new Error("throw method");
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await expect(chan.throw(error)).rejects.toBe(error);
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method before channel is started", async () => {
    const mock = jest.fn();
    const chan = new Channel(() => mock());
    const error = new Error("throw method before channel is started");
    await expect(chan.throw(error)).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("throw method blows away the buffer", async () => {
    const chan = new Channel<number>(async (push, _, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      await stop;
      return -1;
    }, new FixedBuffer(100));
    const error = new Error("throw method blows away the buffer");
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.throw(error)).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method with pending next", async () => {
    const chan = new Channel<number>(async (push, _, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await stop;
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    const next = chan.next();
    const error = new Error("throw method with pending next");
    const throwResult = chan.throw(error);
    await expect(next).rejects.toBe(error);
    await expect(throwResult).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method after close causes throw to reject", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const result: number[] = [];
    const error = new Error("throw method after close causes throw to reject");
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await chan.return();
        await expect(chan.throw(error)).rejects.toBe(error);
      }
    }
    expect(result).toEqual([1, 2, 3]);
  });

  test("stop resolves on close", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, close, stop) => {
      push(1);
      push(2);
      setTimeout(() => close());
      await stop;
      push(3);
      mock();
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalled();
  });

  test("stop resolves on return", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, _, stop) => {
      push(1);
      push(2);
      await stop;
      push(3);
      mock();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    const returned = chan.return();
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalled();
    await expect(returned).resolves.toEqual({ value: -1, done: true });
  });

  test("stop resolves with argument passed to return", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, _, stop) => {
      push(1);
      push(2);
      mock(await stop);
      push(3);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    const returned = chan.return(-2);
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledWith(-2);
    await expect(returned).resolves.toEqual({ value: -1, done: true });
  });
});
