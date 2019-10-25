import {
  Repeater,
  RepeaterOverflowError,
  DroppingBuffer,
  FixedBuffer,
  MAX_QUEUE_LENGTH,
  SlidingBuffer,
} from "../repeater";
import { delayPromise } from "./_testutils";

describe("Repeater", () => {
  test("push", async () => {
    const r = new Repeater((push) => {
      push(1);
      push(2);
      push(3);
      push(4);
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("async push", async () => {
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("push promises", async () => {
    const r = new Repeater((push) => {
      push(Promise.resolve(1));
      push(Promise.resolve(2));
      push(Promise.resolve(3));
      push(Promise.resolve(4));
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("async push promises", async () => {
    const r = new Repeater(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.resolve(3));
      await push(Promise.resolve(4));
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("push delayed promises", async () => {
    const r = new Repeater((push) => {
      push(delayPromise(5, 1));
      push(Promise.resolve(2));
      push(3);
      push(delayPromise(10, 4));
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("async push delayed promises", async () => {
    const r = new Repeater(async (push) => {
      await push(delayPromise(5, 1));
      await push(Promise.resolve(2));
      await push(3);
      await push(delayPromise(10, 4));
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
  });

  test("push rejection", async () => {
    const error = new Error("push rejection");
    const r = new Repeater((push) => {
      push(Promise.resolve(1));
      push(Promise.resolve(2));
      push(Promise.reject(error));
      push(Promise.resolve(4));
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push rejection", async () => {
    const error = new Error("async push rejection");
    const r = new Repeater(async (push) => {
      await push(Promise.resolve(1));
      await push(Promise.resolve(2));
      await push(Promise.reject(error));
      await push(Promise.resolve(4));
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push rejection immediately", async () => {
    const error = new Error("push rejection immediately");
    const r = new Repeater((push) => push(Promise.reject(error)));
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push delayed rejection", async () => {
    const error = new Error("push delayed rejection");
    const r = new Repeater(async (push) => {
      push(delayPromise(5, 1));
      push(Promise.resolve(2));
      push(delayPromise(1, null, error));
      push(4);
      return -1;
    });

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push delayed rejection", async () => {
    const error = new Error("async push delayed rejection");
    const r = new Repeater(async (push) => {
      await push(delayPromise(5, 1));
      await push(Promise.resolve(2));
      await push(delayPromise(1, null, error));
      await push(4);
      return -1;
    });

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push delayed rejection with buffer", async () => {
    const error = new Error("push delayed rejection with buffer");
    const r = new Repeater((push) => {
      push(delayPromise(5, 1));
      push(Promise.resolve(2));
      push(delayPromise(1, null, error));
      push(4);
      return -1;
    }, new FixedBuffer(100));

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push delayed rejection with buffer", async () => {
    const error = new Error("async push delayed rejection with buffer");
    const r = new Repeater((push) => {
      push(delayPromise(5, 1));
      push(Promise.resolve(2));
      push(delayPromise(1, null, error));
      push(4);
      return -1;
    }, new FixedBuffer(100));

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push multiple rejections", async () => {
    const error1 = new Error("push multiple rejections 1");
    const error2 = new Error("push multiple rejections 2");
    const error3 = new Error("push multiple rejections 3");
    const r = new Repeater((push) => {
      push(Promise.resolve(1));
      push(Promise.resolve(2));
      push(Promise.reject(error1));
      push(Promise.reject(error2));
      push(Promise.reject(error3));
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("stop", async () => {
    const r = new Repeater((_, stop) => {
      stop();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("stop with error", async () => {
    const error = new Error("stop with error");
    const r = new Repeater(async (push, stop) => {
      stop(error);
      return -1;
    });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push then stop", async () => {
    const r = new Repeater((push, stop) => {
      push(1);
      push(2);
      push(3);
      push(4);
      stop();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push and stop", async () => {
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push and stop with error", async () => {
    const error = new Error("push and stop with error");
    const r = new Repeater((push, stop) => {
      push(1);
      push(2);
      push(3);
      push(4);
      stop(error);
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push and stop with error", async () => {
    const error = new Error("async push and stop with error");
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop(error);
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push promise and stop", async () => {
    const r = new Repeater((push, stop) => {
      push(1);
      push(2);
      push(Promise.resolve(3));
      push(4);
      stop();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push delayed promise and stop", async () => {
    const r = new Repeater((push, stop) => {
      push(1);
      push(2);
      push(delayPromise(10, 3));
      push(4);
      stop();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push rejection and stop", async () => {
    const error = new Error("push rejection and stop");
    const r = new Repeater((push, stop) => {
      push(1);
      push(2);
      push(Promise.reject(error));
      push(4);
      stop();
      return -1;
    });

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("push delayed rejection and stop", async () => {
    const error = new Error("push delayed rejection and stop");
    const r = new Repeater((push, stop) => {
      push(1);
      push(2);
      push(delayPromise(50, null, error));
      push(4);
      stop();
      return -1;
    });

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push rejection and stop with error", async () => {
    const error1 = new Error("async push rejection and stop with error 1");
    const error2 = new Error("async push rejection and stop with error 2");
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(Promise.reject(error1));
      await push(4);
      stop(error2);
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("async push delayed promises and stop with pending next", async () => {
    const r = new Repeater(async (push, stop) => {
      await push(delayPromise(50, 1));
      await push(delayPromise(50, 2));
      stop();
      return -1;
    });
    const result1 = r.next();
    const result2 = r.next();
    const result3 = r.next();
    await expect(result1).resolves.toEqual({ value: 1, done: false });
    await expect(result2).resolves.toEqual({ value: 2, done: false });
    await expect(result3).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("awaiting stop promise", async () => {
    const mock = jest.fn();
    const r = new Repeater(async (push, stop) => {
      push(1);
      push(2);
      setTimeout(() => stop());
      await stop;
      push(3);
      mock();
    });
    await expect(r.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(r.next()).resolves.toEqual({ done: false, value: 2 });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test("throw error in executor", async () => {
    const error = new Error("throw error in executor");
    const r = new Repeater(() => {
      throw error;
    });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error in executor after push", async () => {
    const error = new Error("throw error in executor after push");
    const r = new Repeater((push) => {
      push(1);
      push(2);
      push(3);
      push(4);
      throw error;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error in executor after async push", async () => {
    const error = new Error("throw error in executor after async push");
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      throw error;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error in executor after push and stop", async () => {
    const error = new Error("throw error in executor after push and stop");
    const r = new Repeater((push, stop) => {
      push(1);
      stop();
      throw error;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error in executor after async push and stop", async () => {
    const error = new Error(
      "throw error in executor after async push and stop",
    );
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      stop();
      throw error;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error after stop with error", async () => {
    const error1 = new Error("throw error after stop with error 1");
    const error2 = new Error("throw error after stop with error 2");
    const r = new Repeater((push, stop) => {
      stop(error1);
      throw error2;
    });
    await expect(r.next()).rejects.toBe(error2);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error after stop with error and delay", async () => {
    const error1 = new Error("throw error after stop with error and delay 1");
    const error2 = new Error("throw error after stop with error and delay 2");
    const r = new Repeater(async (_, stop) => {
      stop(error1);
      await delayPromise(10);
      throw error2;
    });
    await expect(r.next()).rejects.toBe(error2);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw error after async pushing rejection", async () => {
    const error1 = new Error("throw error after async pushing rejection 1");
    const error2 = new Error("throw error after async pushing rejection 2");
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(Promise.reject(error1));
      await push(4);
      throw error2;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return rejection from executor", async () => {
    const error = new Error("return rejection from executor");
    const r = new Repeater(() => Promise.reject(error));
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return rejection from executor after async pushes", async () => {
    const error = new Error(
      "return rejection from executor after async pushes",
    );
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      return Promise.reject(error);
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("ignored repeater", async () => {
    const mock = jest.fn();
    new Repeater(() => mock());
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("pushes await next", async () => {
    const mock = jest.fn();
    const r = new Repeater(async (push) => {
      for (let i = 0; i < 100; i++) {
        mock(await push(i));
      }

      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 0, done: false });
    expect(mock).toHaveBeenCalledTimes(0);
    for (let i = 1; i < 50; i++) {
      expect(mock).toHaveBeenCalledTimes(i - 1);
      await expect(r.next(i)).resolves.toEqual({
        value: i,
        done: false,
      });
      expect(mock).toHaveBeenCalledWith(i);
      expect(mock).toHaveBeenCalledTimes(i);
    }

    await expect(r.next()).resolves.toEqual({ value: 50, done: false });
    expect(mock).toHaveBeenCalledTimes(50);
    await delayPromise(1);
    expect(mock).toHaveBeenCalledTimes(50);
  });

  test("next then push avoids buffer", async () => {
    const buffer: FixedBuffer = new FixedBuffer(100);
    const add = jest.spyOn(buffer, "add");
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater(async (push1) => {
      push = push1;
    }, buffer);
    const next1 = r.next();
    const next2 = r.next();
    push(1);
    push(2);
    await expect(next1).resolves.toEqual({ value: 1, done: false });
    await expect(next2).resolves.toEqual({ value: 2, done: false });
    expect(buffer.empty).toBe(true);
    expect(add).toHaveBeenCalledTimes(0);
    push(3);
    expect(buffer.empty).toBe(false);
    expect(add).toHaveBeenCalledTimes(1);
  });

  test("pushes resolve to value passed to next", async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    r.next(-1);
    r.next(-2);
    r.next(-3);
    r.next(-4);
    const push1 = push(1);
    const push2 = push(2);
    const push3 = push(3);
    const push4 = push(4);
    await expect(push1).resolves.toEqual(-2);
    await expect(push2).resolves.toEqual(-3);
    await expect(push3).resolves.toEqual(-4);
    await expect(
      Promise.race([push4, delayPromise(100, -1000)]),
    ).resolves.toEqual(-1000);
  });

  test("pushes resolve to value passed to next alternating", async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    r.next(-1);
    const push1 = push(1);
    r.next(-2);
    const push2 = push(2);
    r.next(-3);
    const push3 = push(3);
    r.next(-4);
    const push4 = push(4);
    await expect(push1).resolves.toEqual(-2);
    await expect(push2).resolves.toEqual(-3);
    await expect(push3).resolves.toEqual(-4);
    await expect(
      Promise.race([push4, delayPromise(100, -1000)]),
    ).resolves.toEqual(-1000);
  });

  test("pushes resolve to value passed to next irregular", async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    r.next(-1);
    const push1 = push(1);
    const push2 = push(2);
    r.next(-2);
    r.next(-3);
    const push3 = push(3);
    r.next(-4);
    const push4 = push(4);
    await expect(push1).resolves.toEqual(-2);
    await expect(push2).resolves.toEqual(-3);
    await expect(push3).resolves.toEqual(-4);
    await expect(
      Promise.race([push4, delayPromise(1, -1000)]),
    ).resolves.toEqual(-1000);
  });

  test("pushes resolve to value passed to next pushes first", async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater((push1) => (push = push1));
    r.next(-1);
    const push1 = push(1);
    const push2 = push(2);
    const push3 = push(3);
    const push4 = push(4);
    r.next(-2);
    r.next(-3);
    r.next(-4);
    await expect(push1).resolves.toEqual(-2);
    await expect(push2).resolves.toEqual(-3);
    await expect(push3).resolves.toEqual(-4);
    await expect(
      Promise.race([push4, delayPromise(1, -1000)]),
    ).resolves.toEqual(-1000);
  });

  test("pushes resolve to undefined with buffer", async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater(async (push1) => {
      push = push1;
    }, new FixedBuffer(3));
    const next1 = r.next(-1);
    const push1 = push(1);
    const push2 = push(2);
    const push3 = push(3);
    const push4 = push(4);
    const push5 = push(5);
    await expect(next1).resolves.toEqual({ value: 1, done: false });
    await expect(r.next(-2)).resolves.toEqual({ value: 2, done: false });
    await expect(push1).resolves.toEqual(-2);
    await expect(r.next(-3)).resolves.toEqual({ value: 3, done: false });
    await expect(r.next(-4)).resolves.toEqual({ value: 4, done: false });
    await expect(r.next(-5)).resolves.toEqual({ value: 5, done: false });
    await expect(push2).resolves.toBeUndefined();
    await expect(push3).resolves.toBeUndefined();
    await expect(push4).resolves.toBeUndefined();
    await expect(push5).resolves.toBe(-3);
    const push6 = push(6);
    const push7 = push(7);
    const push8 = push(8);
    const push9 = push(9);
    await expect(r.next(-6)).resolves.toEqual({ value: 6, done: false });
    await expect(r.next(-7)).resolves.toEqual({ value: 7, done: false });
    await expect(r.next(-8)).resolves.toEqual({ value: 8, done: false });
    await expect(r.next(-9)).resolves.toEqual({ value: 9, done: false });
    await expect(push6).resolves.toBeUndefined();
    await expect(push7).resolves.toBeUndefined();
    await expect(push8).resolves.toBeUndefined();
    await expect(push9).resolves.toBe(-7);
  });

  test("push throws when push queue is full", async () => {
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater(async (push1) => {
      push = push1;
      push(null);
    });
    await expect(r.next()).resolves.toEqual({
      value: null,
      done: false,
    });

    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      push(i);
    }

    expect(() => push(-1)).toThrow(RepeaterOverflowError);
    expect(() => push(-2)).toThrow(RepeaterOverflowError);
  });

  test("push throws when buffer and push queue are full", async () => {
    const bufferLength = 1000;
    let push!: (value: unknown) => Promise<unknown>;
    const r = new Repeater(async (push1) => {
      push = push1;
      push(null);
    }, new FixedBuffer(bufferLength));
    await expect(r.next()).resolves.toEqual({
      value: null,
      done: false,
    });

    for (let i = 0; i < bufferLength; i++) {
      push(i);
    }

    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      push(i);
    }

    expect(() => push(-1)).toThrow(RepeaterOverflowError);
    expect(() => push(-2)).toThrow(RepeaterOverflowError);
  });

  test("next throws when pull queue is full", async () => {
    const r = new Repeater(() => {}, new FixedBuffer(3));
    for (let i = 0; i < MAX_QUEUE_LENGTH; i++) {
      r.next();
    }

    expect(() => r.next()).toThrow(RepeaterOverflowError);
    expect(() => r.next()).toThrow(RepeaterOverflowError);
  });

  test("dropping buffer", async () => {
    const r = new Repeater((push, stop) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      stop();
    }, new DroppingBuffer(3));
    await expect(r.next()).resolves.toEqual({ value: 0, done: false });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("sliding buffer", async () => {
    const r = new Repeater((push, stop) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      stop();
    }, new SlidingBuffer(3));
    await expect(r.next()).resolves.toEqual({ value: 97, done: false });
    await expect(r.next()).resolves.toEqual({ value: 98, done: false });
    await expect(r.next()).resolves.toEqual({ value: 99, done: false });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("break in for await", async () => {
    const r = new Repeater<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = jest.spyOn(r, "return");
    const result: number[] = [];
    for await (const num of r) {
      result.push(num);
      if (num === 3) {
        break;
      }
    }
    expect(result).toEqual([1, 2, 3]);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw in for await", async () => {
    const error = new Error("throw in for await");
    const r = new Repeater<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const spy = jest.spyOn(r, "return");
    const result: number[] = [];
    await expect(
      (async () => {
        for await (const num of r) {
          result.push(num);
          if (num === 3) {
            throw error;
          }
        }
      })(),
    ).rejects.toBe(error);
    expect(result).toEqual([1, 2, 3]);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method", async () => {
    const r = new Repeater<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      return -1;
    });
    const result: number[] = [];
    for await (const num of r) {
      result.push(num);
      if (num === 3) {
        await expect(r.return()).resolves.toEqual({ done: true });
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method before execution", async () => {
    const mock = jest.fn();
    const r = new Repeater(() => mock());
    await expect(r.return(-1)).resolves.toEqual({
      value: -1,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("return method with buffer", async () => {
    const r = new Repeater(async (push) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      return -1;
    }, new FixedBuffer(100));
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.return()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with buffer after stop", async () => {
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop();
      return -1;
    }, new FixedBuffer(100));
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.return()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with buffer after stop with error", async () => {
    const error = new Error("return method with buffer after stop with error");
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop(error);
      return -1;
    }, new FixedBuffer(100));
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.return()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with throw in executor", async () => {
    const error = new Error("return method with throw in executor");
    const r = new Repeater(async (push) => {
      for (let i = 1; i < 100; i++) {
        await push(i);
      }

      throw error;
    }, new FixedBuffer(100));
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.return()).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with argument", async () => {
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await stop;
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.return(-2)).resolves.toEqual({
      value: -2,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.return()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.return(-3)).resolves.toEqual({
      value: -3,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with promise argument", async () => {
    const r = new Repeater(async (push, stop) => {
      await push(1);
      await push(2);
      await push(3);
      await stop;
      return -1;
    });

    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.return(Promise.resolve(-2))).resolves.toEqual({
      value: -2,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.return()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.return(Promise.resolve(-3))).resolves.toEqual({
      value: -3,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with argument and pending next", async () => {
    const r = new Repeater(() => {
      return -1;
    });
    const next = r.next();
    const returned = r.return(-2);
    await expect(next).resolves.toEqual({ value: -1, done: true });
    await expect(returned).resolves.toEqual({ value: -2, done: true });
  });

  test("return method with pushed rejection", async () => {
    const error = new Error("return method with pushed rejection");
    const r = new Repeater((push) => {
      push(1);
      push(Promise.reject(error));
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.return(-2)).resolves.toEqual({
      value: -2,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("return method with async pushed rejection", async () => {
    const error = new Error("return method with async pushed rejection");
    const r = new Repeater(async (push) => {
      await push(1);
      await push(Promise.reject(error));
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.return(-2)).resolves.toEqual({
      value: -2,
      done: true,
    });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw method", async () => {
    const error = new Error("throw method");
    const mock = jest.fn();
    const r = new Repeater(async (push, stop) => {
      push(1);
      push(2);
      push(3);
      push(4);
      await stop;
      mock();
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.throw(error)).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test("throw method before execution", async () => {
    const error = new Error("throw method before execution");
    const mock = jest.fn();
    const r = new Repeater(() => mock());
    await expect(r.throw(error)).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("throw method caught in async function", async () => {
    const error = new Error("throw method caught in async function");
    const errors: Error[] = [];
    const r = new Repeater(async (push, stop) => {
      for (let i = 0; i < 8; i++) {
        try {
          await push(i);
        } catch (err) {
          errors.push(err);
        }
      }

      stop();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 0, done: false });
    await expect(r.throw(error)).resolves.toEqual({
      value: 1,
      done: false,
    });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.throw(error)).resolves.toEqual({
      value: 3,
      done: false,
    });
    await expect(r.next()).resolves.toEqual({ value: 4, done: false });
    await expect(r.throw(error)).resolves.toEqual({
      value: 5,
      done: false,
    });
    await expect(r.next()).resolves.toEqual({ value: 6, done: false });
    await expect(r.throw(error)).resolves.toEqual({
      value: 7,
      done: false,
    });
    await expect(r.next()).resolves.toEqual({ value: -1, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(errors).toEqual(Array(4).fill(error));
  });

  test("throw method with Promise.prototype.catch", async () => {
    const error = new Error("throw method with Promise.prototype.catch");
    const mock = jest.fn();
    const r = new Repeater((push) => {
      push(1).catch(mock);
      push(2).catch(mock);
      push(3).catch(mock);
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.throw(error)).resolves.toEqual({
      value: 2,
      done: false,
    });
    await expect(r.throw(error)).resolves.toEqual({
      value: 3,
      done: false,
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  test("throw method with buffer after stop", async () => {
    const error = new Error("throw method with buffer after stop");
    const mock = jest.fn();
    const r = new Repeater((push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i).catch(mock);
      }
      stop();
      return -1;
    }, new FixedBuffer(100));
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.throw(error)).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("throw method after stop with error", async () => {
    const error1 = new Error("throw method after stop with error 1");
    const error2 = new Error("throw method after stop with error 2");
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      stop(error1);
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.throw(error2)).rejects.toBe(error1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw method with throw in executor", async () => {
    const error1 = new Error("throw method with throw in executor 1");
    const error2 = new Error("throw method with throw in executor 2");
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }
      throw error1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.throw(error2)).rejects.toBe(error1);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw method with pending next", async () => {
    const mock = jest.fn();
    const error = new Error("throw method with pending next");
    const r = new Repeater(async (push, stop) => {
      for (let i = 1; i < 100; i++) {
        push(i);
      }

      await stop;
      mock();
      return -1;
    });
    const next1 = r.next(-1);
    const next2 = r.next(-2);
    const next3 = r.next(-3);
    const next4 = r.next(-4);
    const thrown = r.throw(error);
    await expect(next1).resolves.toEqual({ value: 1, done: false });
    await expect(next2).resolves.toEqual({ value: 2, done: false });
    await expect(next3).resolves.toEqual({ value: 3, done: false });
    await expect(next4).resolves.toEqual({ value: 4, done: false });
    await expect(thrown).rejects.toBe(error);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test("return method before throw method", async () => {
    const error = new Error("return method before throw method");
    const mock = jest.fn();
    const r = new Repeater(async (push, stop) => {
      push(1);
      await stop;
      mock();
      return -1;
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    const thrown = r.throw(error);
    const returned = r.return(-2);
    await expect(thrown).rejects.toBe(error);
    await expect(returned).resolves.toEqual({ value: -2, done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  test("throw method after return method", async () => {
    const error = new Error("throw method after return method");
    const r = new Repeater(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    await expect(r.next()).resolves.toEqual({ value: 1, done: false });
    await expect(r.next()).resolves.toEqual({ value: 2, done: false });
    await expect(r.next()).resolves.toEqual({ value: 3, done: false });
    await expect(r.return()).resolves.toEqual({ done: true });
    await expect(r.throw(error)).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.throw(error)).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("throw method with buffer", async () => {
    const error = new Error("throw method with buffer");
    const mock = jest.fn();
    const r = new Repeater((push) => {
      for (let i = 1; i < 100; i++) {
        push(i).catch(mock);
      }
      return -1;
    }, new FixedBuffer(100));
    await expect(r.throw(error)).rejects.toBe(error);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalledTimes(0);
  });

  test("results settle in order", async () => {
    const r = new Repeater((push, stop) => {
      push(delayPromise(10, 1));
      push(Promise.resolve(2));
      push(3);
      stop();
      return -1;
    });
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.next();
    const r4 = r.next();
    const r5 = r.next();
    await Promise.all([
      expect(Promise.race([r5, r4, r3, r2, r1])).resolves.toEqual({
        value: 1,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3, r2, r1])).resolves.toEqual({
        value: 1,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3, r2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3])).resolves.toEqual({
        value: 3,
        done: false,
      }),
      expect(Promise.race([r5, r4])).resolves.toEqual({
        value: -1,
        done: true,
      }),
      expect(r5).resolves.toEqual({ done: true }),
    ]);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("results settle in order with buffer", async () => {
    const r = new Repeater((push, stop) => {
      push(delayPromise(10, 1));
      push(Promise.resolve(2));
      push(3);
      stop();
      return -1;
    }, new FixedBuffer(100));
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.next();
    const r4 = r.next();
    const r5 = r.next();
    await Promise.all([
      expect(Promise.race([r5, r4, r3, r2, r1])).resolves.toEqual({
        value: 1,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3, r2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3])).resolves.toEqual({
        value: 3,
        done: false,
      }),
      expect(Promise.race([r5, r4])).resolves.toEqual({
        value: -1,
        done: true,
      }),
      expect(r5).resolves.toEqual({ done: true }),
    ]);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("results settle in order with rejection", async () => {
    const error = new Error("results settle in order with rejection");
    const r = new Repeater((push) => {
      push(delayPromise(100, 1));
      push(delayPromise(10, 2));
      push(Promise.reject(error));
      push(4);
      return 5;
    });
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.next();
    const r4 = r.next();
    const r5 = r.next();
    await Promise.all([
      expect(Promise.race([r5, r4, r3, r2, r1])).resolves.toEqual({
        value: 1,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3, r2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3])).rejects.toBe(error),
      expect(Promise.race([r5, r4])).resolves.toEqual({ done: true }),
      expect(r5).resolves.toEqual({ done: true }),
    ]);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });

  test("results settle in order with return method and rejection", async () => {
    const error = new Error(
      "results settle in order with return method and rejection",
    );
    const r = new Repeater((push) => {
      push(delayPromise(100, 1));
      push(delayPromise(10, 2));
      push(Promise.reject(error));
      push(4);
      return 5;
    });
    const r1 = r.next();
    const r2 = r.next();
    const r3 = r.return(-1);
    const r4 = r.next();
    const r5 = r.return(-2);
    await Promise.all([
      expect(Promise.race([r5, r4, r3, r2, r1])).resolves.toEqual({
        value: 1,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3, r2])).resolves.toEqual({
        value: 2,
        done: false,
      }),
      expect(Promise.race([r5, r4, r3])).resolves.toEqual({
        value: -1,
        done: true,
      }),
      expect(Promise.race([r5, r4])).resolves.toEqual({ done: true }),
      expect(r5).resolves.toEqual({ value: -2, done: true }),
    ]);
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
    await expect(r.next()).resolves.toEqual({ done: true });
  });
});
