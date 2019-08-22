import {
  Channel,
  ChannelOverflowError,
  DroppingBuffer,
  FixedBuffer,
  MAX_QUEUE_LENGTH,
  SlidingBuffer,
} from "../index";

import { delayPromise } from "../_testutils";

// TODO: create a jest matcher to help us test AsyncIterators
describe("Channel", () => {
  test("push", async () => {
    const chan = new Channel((push) => {
      push(1);
      push(2);
      push(3);
      push(4);
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("async push", async () => {
    const chan = new Channel(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("push promises", async () => {
    const chan = new Channel((push) => {
      push(Promise.resolve(1));
      push(Promise.resolve(2));
      push(Promise.resolve(3));
      push(Promise.resolve(4));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("async push promises", async () => {
    const chan = new Channel(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.resolve(3));
      await push(Promise.resolve(4));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("push rejection", async () => {
    const error = new Error("push rejection");
    const chan = new Channel((push) => {
      push(Promise.resolve(1));
      push(Promise.resolve(2));
      push(Promise.reject(error));
      push(Promise.resolve(4));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push rejection", async () => {
    const error = new Error("async push rejection");
    const chan = new Channel(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.reject(error));
      await push(Promise.resolve(4));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push delayed promises", async () => {
    const chan = new Channel((push) => {
      push(delayPromise(5, 1));
      push(delayPromise(5, 2));
      push(delayPromise(5, 3));
      push(delayPromise(5, 4));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("async push delayed promises", async () => {
    const chan = new Channel(async (push) => {
      await push(delayPromise(5, 1));
      await push(delayPromise(5, 2));
      await push(delayPromise(5, 3));
      await push(delayPromise(5, 4));
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("push delayed rejection", async () => {
    const error = new Error("push delayed rejection");
    const chan = new Channel(async (push) => {
      push(delayPromise(5, 1));
      push(delayPromise(5, 2));
      push(delayPromise(5, 3, error));
      push(delayPromise(5, 4));
    });

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push delayed rejection", async () => {
    const error = new Error("async push delayed rejection");
    const chan = new Channel(async (push) => {
      await push(delayPromise(5, 1));
      await push(delayPromise(5, 2));
      await push(delayPromise(5, 3, error));
      await push(delayPromise(5, 4));
    });

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push delayed rejection with buffer", async () => {
    const error = new Error("push delayed rejection with buffer");
    const chan = new Channel<number>((push) => {
      push(delayPromise(5, 1));
      push(delayPromise(5, 2));
      push(delayPromise(5, 3, error));
      push(delayPromise(5, 4));
    }, new FixedBuffer(100));

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("stop", async () => {
    const chan = new Channel((_, stop) => {
      stop();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("stop with error", async () => {
    const error = new Error("stop with error");
    const chan = new Channel(async (push, stop) => {
      stop(error);
      return -1;
    });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push and stop", async () => {
    const chan = new Channel((push, stop) => {
      push(1);
      push(2);
      push(3);
      push(4);
      stop();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push and stop", async () => {
    const chan = new Channel(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push and stop with error", async () => {
    const error = new Error("push and stop with error");
    const chan = new Channel((push, stop) => {
      push(1);
      push(2);
      push(3);
      push(4);
      stop(error);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push and stop with error", async () => {
    const error = new Error("async push and stop with error");
    const chan = new Channel(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop(error);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push promise and stop", async () => {
    const chan = new Channel((push, stop) => {
      push(1);
      push(2);
      push(Promise.resolve(3));
      push(4);
      stop();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push rejection and stop", async () => {
    const error = new Error("push rejection and stop");
    const chan = new Channel((push, stop) => {
      push(1);
      push(2);
      push(Promise.reject(error));
      push(4);
      stop();
      return -1;
    });

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push delayed promise and stop", async () => {
    const chan = new Channel((push, stop) => {
      push(1);
      push(2);
      push(delayPromise(50, 3));
      push(4);
      stop();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push delayed rejection and stop", async () => {
    const error = new Error("pushing delayed rejection and stop");
    const chan = new Channel((push, stop) => {
      push(1);
      push(2);
      push(delayPromise(50, 3, error));
      push(4);
      stop();
      return -1;
    });

    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push rejection and stop with error", async () => {
    const error1 = new Error("async push rejection and stop with error 1");
    const error2 = new Error("async push rejection and stop with error 2");
    const chan = new Channel(async (push, stop) => {
      await push(1);
      await push(2);
      await push(Promise.reject(error1));
      await push(4);
      stop(error2);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error1);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push rejection and throw error", async () => {
    const error1 = new Error("async push rejection and throw error 1");
    const error2 = new Error("async push rejection and throw error 2");
    const chan = new Channel(async (push) => {
      await push(1);
      await push(2);
      await push(Promise.reject(error1));
      await push(4);
      throw error2;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error1);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("async push delayed promises and stop with pending next", async () => {
    const chan = new Channel(async (push, stop) => {
      await push(delayPromise(50, 1));
      await push(delayPromise(50, 2));
      stop();
      return -1;
    });
    const result1 = chan.next();
    const result2 = chan.next();
    const result3 = chan.next();
    await expect(result1).resolves.toEqual({ value: 1, done: false });
    await expect(result2).resolves.toEqual({ value: 2, done: false });
    await expect(result3).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error", async () => {
    const error = new Error("throw error in executor");
    const chan = new Channel(() => {
      throw error;
    });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error after push", async () => {
    const error = new Error("throw error after push");
    const chan = new Channel((push) => {
      push(1);
      push(2);
      push(3);
      push(4);
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error after async push", async () => {
    const error = new Error("executor throws error after async push");
    const chan = new Channel(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error after push and stop", async () => {
    const error = new Error("throw error after push and stop");
    const chan = new Channel((push, stop) => {
      push(1);
      stop();
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error after async push and stop", async () => {
    const error = new Error("throw error after async push and stop");
    const chan = new Channel(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop();
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error after stop with error", async () => {
    const error1 = new Error("throw error after stop with error 1");
    const error2 = new Error("throw error after stop with error 2");
    const chan = new Channel((push, stop) => {
      stop(error1);
      throw error2;
    });
    await expect(chan.next()).rejects.toBe(error2);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw error after async stop with error", async () => {
    const error1 = new Error("throw error after async stop with error 1");
    const error2 = new Error("throw error after async stop with error 2");
    const chan = new Channel(async (_, stop) => {
      stop(error1);
      await delayPromise(100);
      throw error2;
    });
    await expect(chan.next()).rejects.toBe(error2);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return rejected promise", async () => {
    const error = new Error("return rejected promise");
    const chan = new Channel(() => Promise.reject(error));
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("returns rejected promise after async pushes", async () => {
    const error = new Error("return rejected promise after async pushes");
    const chan = new Channel(async (push) => {
      await push(1);
      await push(2);
      return Promise.reject(error);
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("ignored channel", async () => {
    const mock = jest.fn();
    new Channel(() => mock());
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("pushes await next", async () => {
    const mock = jest.fn();
    const chan = new Channel(async (push) => {
      for (let i = 0; i < 100; i++) {
        await push(i);
        mock();
      }
      return -1;
    });
    for (let i = 0; i < 50; i++) {
      await expect(chan.next()).resolves.toEqual({
        value: mock.mock.calls.length,
        done: false,
      });
    }
    await expect(chan.next()).resolves.toEqual({ value: 50, done: false });
    expect(mock).toHaveBeenCalledTimes(51);
    await delayPromise(100);
    expect(mock).toHaveBeenCalledTimes(51);
  });

  test("next then push avoids buffer", async () => {
    const buffer: FixedBuffer<number> = new FixedBuffer(100);
    const add = jest.spyOn(buffer, "add");
    let push: (value: number) => Promise<any>;
    const chan = new Channel(async (push1) => {
      push = push1;
    }, buffer);
    const next1 = chan.next();
    const next2 = chan.next();
    await push!(1);
    await push!(2);
    await expect(next1).resolves.toEqual({ value: 1, done: false });
    await expect(next2).resolves.toEqual({ value: 2, done: false });
    expect(buffer.empty).toBe(true);
    expect(add).toHaveBeenCalledTimes(0);
    push!(3);
    expect(buffer.empty).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
  });

  test("pushes resolve to value passed to next", async () => {
    let push: (value: number) => Promise<number | void>;
    const chan = new Channel(async (push1) => {
      push = push1;
    });
    const next1 = chan.next(-1);
    const push1 = push!(1);
    await expect(push1).resolves.toEqual(-1);
    await expect(next1).resolves.toEqual({ value: 1, done: false });
    const push2 = push!(2);
    await expect(chan.next(-2)).resolves.toEqual({ value: 2, done: false });
    await expect(push2).resolves.toEqual(-2);
  });

  test("pushes resolve to undefined when using a buffer", async () => {
    let push: (value: number) => Promise<number | void>;
    const chan = new Channel<number>(async (push1) => {
      push = push1;
    }, new FixedBuffer(3));
    const next1 = chan.next(-1);
    const push1 = push!(1);
    const push2 = push!(2);
    const push3 = push!(3);
    const push4 = push!(4);
    const push5 = push!(5);
    await expect(next1).resolves.toEqual({ value: 1, done: false });
    await expect(push1).resolves.toBe(-1);
    await expect(chan.next(-2)).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next(-3)).resolves.toEqual({ value: 3, done: false });
    await expect(chan.next(-4)).resolves.toEqual({ value: 4, done: false });
    await expect(chan.next(-5)).resolves.toEqual({ value: 5, done: false });
    await expect(push2).resolves.toBeUndefined();
    await expect(push3).resolves.toBeUndefined();
    await expect(push4).resolves.toBeUndefined();
    await expect(push5).resolves.toBe(-2);
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
    await expect(push9).resolves.toBe(-6);
  });

  test("results settle in order", async () => {
    const chan = new Channel(async (push, stop) => {
      await push(delayPromise(200, 1));
      await push(delayPromise(20, 2));
      await push(delayPromise(2, 3));
      stop();
      return -1;
    });
    const result1 = chan.next();
    const result2 = chan.next();
    const result3 = chan.next();
    const result4 = chan.next();
    await Promise.all([
      expect(
        Promise.race([result4, result3, result2, result1]),
      ).resolves.toEqual({ value: 1, done: false }),
      expect(Promise.race([result4, result3, result2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([result4, result3])).resolves.toEqual({
        value: 3,
        done: false,
      }),
      expect(result4).resolves.toEqual({ value: -1, done: true }),
    ]);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("results settle in order with buffer", async () => {
    const chan = new Channel<number>(async (push, stop) => {
      await push(delayPromise(200, 1));
      await push(delayPromise(20, 2));
      await push(delayPromise(2, 3));
      stop();
      return -1;
    }, new FixedBuffer(100));
    const result1 = chan.next();
    const result2 = chan.next();
    const result3 = chan.next();
    const result4 = chan.next();
    await Promise.all([
      expect(
        Promise.race([result4, result3, result2, result1]),
      ).resolves.toEqual({ value: 1, done: false }),
      expect(Promise.race([result4, result3, result2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([result4, result3])).resolves.toEqual({
        value: 3,
        done: false,
      }),
      expect(result4).resolves.toEqual({ value: -1, done: true }),
    ]);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("results settle in order with rejection", async () => {
    const error = new Error("results settle in order with rejection");
    const chan = new Channel(async (push) => {
      await push(delayPromise(200, 1));
      await push(delayPromise(20, 2));
      await push(delayPromise(2, 3, error));
      await push(4);
      return 5;
    });
    const result1 = chan.next();
    const result2 = chan.next();
    const result3 = chan.next();
    const result4 = chan.next();
    await Promise.all([
      expect(
        Promise.race([result4, result3, result2, result1]),
      ).resolves.toEqual({ value: 1, done: false }),
      expect(Promise.race([result4, result3, result2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([result4, result3])).rejects.toBe(error),
      expect(result4).resolves.toEqual({ done: true }),
    ]);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("push throws when buffer and push queue are full", async () => {
    const bufferLength = 1000;
    let push: (value: number) => Promise<any>;
    const chan = new Channel<number>(async (push1) => {
      push = push1;
      push(-10);
    }, new FixedBuffer(bufferLength));
    await expect(chan.next()).resolves.toEqual({ value: -10, done: false });
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
    const chan = new Channel(() => {}, new FixedBuffer(3));
    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      chan.next();
    }
    expect(() => chan.next()).toThrow(ChannelOverflowError);
    expect(() => chan.next()).toThrow(ChannelOverflowError);
  });

  test("dropping buffer", async () => {
    const chan = new Channel<number>((push, stop) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      stop();
    }, new DroppingBuffer(3));
    await expect(chan.next()).resolves.toEqual({ value: 0, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sliding buffer", async () => {
    const chan = new Channel<number>((push, stop) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      stop();
    }, new SlidingBuffer(3));
    await expect(chan.next()).resolves.toEqual({ value: 97, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 98, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 99, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
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
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("early throw", async () => {
    const error = new Error("early throw");
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = jest.spyOn(chan, "return");
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
    await expect(chan.next()).resolves.toEqual({ done: true });
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
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method before start", async () => {
    const mock = jest.fn();
    const chan = new Channel(() => mock());
    await expect(chan.return()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("return method with buffer", async () => {
    const chan = new Channel<number>(async (push) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.return()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method with buffer after stop", async () => {
    const chan = new Channel<number>(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop();
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.return()).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method with buffer after stop with error", async () => {
    const error = new Error("return method with buffer after stop with error");
    const chan = new Channel<number>(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop(error);
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.return()).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method with argument", async () => {
    const chan = new Channel(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await expect(stop).resolves.toEqual(-2);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.return(-2)).resolves.toEqual({ value: -1, done: true });
    await expect(chan.return()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.return(-3)).resolves.toEqual({ value: -3, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method", async () => {
    const error = new Error("throw method");
    const chan = new Channel<number>(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      await stop;
    });
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await expect(chan.throw(error)).rejects.toBe(error);
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method before start", async () => {
    const error = new Error("throw method before start");
    const mock = jest.fn();
    const chan = new Channel(() => mock());
    await expect(chan.throw(error)).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("throw method with buffer", async () => {
    const error = new Error("throw method with buffer");
    const chan = new Channel<number>(async (push) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.throw(error)).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method with buffer after stop", async () => {
    const error = new Error("throw method with buffer after stop");
    const chan = new Channel<number>(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop();
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.throw(error)).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method with buffer after stop with error", async () => {
    const error1 = new Error(
      "throw method with buffer after stop with error 1",
    );
    const error2 = new Error(
      "throw method with buffer after stop with error 2",
    );
    const chan = new Channel<number>(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop(error1);
      return -1;
    }, new FixedBuffer(100));
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 2, done: false });
    await expect(chan.next()).resolves.toEqual({ value: 3, done: false });
    await expect(chan.throw(error2)).rejects.toBe(error1);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method with pending next", async () => {
    const error = new Error("throw method with pending next");
    const chan = new Channel<number>(async (push, stop) => {
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
    const throwResult = chan.throw(error);
    await expect(next).rejects.toBe(error);
    await expect(throwResult).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method after return", async () => {
    const error = new Error("throw method after return");
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await chan.return();
        await expect(chan.throw(error)).rejects.toBe(error);
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.throw(error)).rejects.toBe(error);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("stop promise", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, stop) => {
      push(1);
      push(2);
      setTimeout(() => stop());
      await stop;
      push(3);
      mock();
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalled();
  });

  test("stop promise and return method", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, stop) => {
      push(1);
      push(2);
      await stop;
      push(3);
      mock();
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    expect(mock).toHaveBeenCalledTimes(0);
    const returned = chan.return();
    expect(mock).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(mock).toHaveBeenCalledTimes(1);
    await expect(returned).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("stop promise and return method with argument", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, stop) => {
      push(1);
      push(2);
      mock(await stop);
      push(3);
      return -1;
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    expect(mock).toHaveBeenCalledTimes(0);
    const returned = chan.return(-2);
    expect(mock).toHaveBeenCalledTimes(0);
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledWith(-2);
    await expect(returned).resolves.toEqual({ value: -1, done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
  });
});
