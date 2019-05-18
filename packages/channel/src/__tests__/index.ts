import {
  Channel,
  ChannelOverflowError,
  DroppingBuffer,
  FixedBuffer,
  MAX_QUEUE_LENGTH,
  SlidingBuffer,
} from "../index";

describe("buffers", () => {
  describe("FixedBuffer", () => {
    test("simple", () => {
      const buffer = new FixedBuffer<number>(2);
      expect([buffer.empty, buffer.full]).toEqual([true, false]);
      buffer.add(1);
      expect([buffer.empty, buffer.full]).toEqual([false, false]);
      buffer.add(2);
      expect([buffer.empty, buffer.full]).toEqual([false, true]);
      expect(buffer.remove()).toEqual(1);
      expect([buffer.empty, buffer.full]).toEqual([false, false]);
      expect(buffer.remove()).toEqual(2);
      expect([buffer.empty, buffer.full]).toEqual([true, false]);
      expect(buffer.remove()).toEqual(undefined);
    });

    test("throws when full", () => {
      const buffer = new FixedBuffer<number>(2);
      expect(buffer.empty).toBe(true);
      buffer.add(1);
      buffer.add(2);
      expect(buffer.full).toBe(true);
      expect(() => buffer.add(3)).toThrow();
    });
  });

  describe("SlidingBuffer", () => {
    test("simple", () => {
      const buffer = new SlidingBuffer<number>(2);
      expect([buffer.empty, buffer.full]).toEqual([true, false]);
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      buffer.add(4);
      buffer.add(5);
      expect([buffer.empty, buffer.full]).toEqual([false, false]);
      expect(buffer.remove()).toEqual(4);
      expect(buffer.remove()).toEqual(5);
      expect([buffer.empty, buffer.full]).toEqual([true, false]);
      expect(buffer.remove()).toEqual(undefined);
    });
  });

  describe("DroppingBuffer", () => {
    test("simple", () => {
      const buffer = new DroppingBuffer<number>(2);
      expect([buffer.empty, buffer.full]).toEqual([true, false]);
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      buffer.add(4);
      buffer.add(5);
      expect([buffer.empty, buffer.full]).toEqual([false, false]);
      expect(buffer.remove()).toEqual(1);
      expect(buffer.remove()).toEqual(2);
      expect([buffer.empty, buffer.full]).toEqual([true, false]);
      expect(buffer.remove()).toEqual(undefined);
    });
  });
});

describe("Channel", () => {
  test("sync pushes", async () => {
    const chan = new Channel<number>((push, close) => {
      push(1);
      push(2);
      push(3);
      push(4);
      push(5);
      close();
    });
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
    }
    expect(result).toEqual([1]);
  });

  test("async pushes", async () => {
    const chan = new Channel<number>(async (push, close) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
      await push(5);
      close();
    });
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test("sync error in executor", async () => {
    const error = new Error("Sync error in executor");
    const chan = new Channel<number>(() => {
      throw error;
    });
    await expect(chan.next()).rejects.toBe(error);
  });

  test("async error in executor", async () => {
    const error = new Error("Async error in executor");
    const chan = new Channel<number>(async () => {
      throw error;
    });
    await expect(chan.next()).rejects.toBe(error);
  });

  test("sync error in executor after close causes return to reject", async () => {
    const error = new Error("Sync error after close");
    const chan = new Channel<number>((push, close) => {
      push(1);
      close();
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.return()).rejects.toBe(error);
  });

  test("async error in executor after close causes return to reject", async () => {
    const error = new Error("Async error after close");
    const chan = new Channel<number>(async (push, close) => {
      await push(1);
      close();
      throw error;
    });
    await expect(chan.next()).resolves.toEqual({ value: 1, done: false });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.next()).resolves.toEqual({ done: true });
    await expect(chan.return()).rejects.toBe(error);
  });

  test("pull then push avoids buffer", async () => {
    const buffer = new FixedBuffer<number>(1);
    let push: (value: number) => Promise<boolean>;
    const chan = new Channel((push1) => {
      push = push1;
      push(1);
    }, buffer);
    // prime the channel
    await chan.next();
    const result = chan.next();
    push!(2);
    expect(buffer.empty).toBe(true);
    await expect(result).resolves.toEqual({ value: 2, done: false });
  });

  test("pushes throw when buffer and push queue are full", async () => {
    const bufferLength = 3;
    let push: (value: number) => Promise<boolean>;
    const chan = new Channel<number>((push1) => {
      push = push1;
      push(-1);
    }, new FixedBuffer(bufferLength));
    // prime the channel
    await chan.next();
    let i = 0;
    for (; i < bufferLength + MAX_QUEUE_LENGTH; i++) {
      push!(i);
    }
    expect(() => push(i++)).toThrow(ChannelOverflowError);
    expect(() => push(i++)).toThrow(ChannelOverflowError);
  });

  test("pushes tell you if they’ve been accepted", async () => {
    let push: (value: number) => Promise<boolean>;
    let close: () => void;
    const chan = new Channel<number>((push1, close1) => {
      push = push1;
      close = close1;
      push(0);
    });
    // prime the channel
    await chan.next();
    const p = push!(1);
    await chan.next();
    expect(p).resolves.toBe(true);
    close!();
    expect(push!(2)).resolves.toBe(false);
  });

  test("pulls throw when pull queue is full", async () => {
    const chan = new Channel(() => {}, new FixedBuffer(3));
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
    for await (const num of chan) {
      result.push(num);
    }
    expect(result).toEqual([0, 1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sliding buffer", async () => {
    const chan = new Channel<number>((push, close) => {
      for (let i = 0; i < 100; i++) {
        push(i);
      }
      close();
    }, new SlidingBuffer(3));
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
    }
    expect(result).toEqual([0, 97, 98, 99]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("early break", async () => {
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
        break;
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("early throw", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const error = new Error("Error thrown with throw");
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
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("return method", async () => {
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
        await expect(chan.return()).resolves.toEqual({ done: true });
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("throw method", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const result: number[] = [];
    const error = new Error("Error passed to throw method");
    await expect(
      (async () => {
        for await (const num of chan) {
          result.push(num);
          if (num === 3) {
            await expect(chan.throw(error)).resolves.toEqual({ done: true });
          }
        }
      })(),
    ).rejects.toBe(error);
    expect(result).toEqual([1, 2, 3]);
  });

  test("calling throw method after close causes throw to reject", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const result: number[] = [];
    const error = new Error("Error passed to throw method on closed channel");
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await chan.return();
        await expect(chan.throw(error)).rejects.toBe(error);
      }
    }
    expect(result).toEqual([1, 2, 3]);
  });

  test("stop", async () => {
    const mock = jest.fn();
    const chan = new Channel<number>(async (push, _, stop) => {
      push(1);
      push(2);
      await stop;
      push(3);
      mock();
    });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(chan.next()).resolves.toEqual({ done: false, value: 2 });
    chan.return();
    await expect(chan.next()).resolves.toEqual({ done: true });
    expect(mock).toHaveBeenCalled();
  });
});
