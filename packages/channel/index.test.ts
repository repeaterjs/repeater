import {
  Channel,
  ChannelOverflowError,
  DroppingBuffer,
  FixedBuffer,
  SlidingBuffer,
} from "./index";

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
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      buffer.add(4);
      buffer.add(5);
      expect(buffer.full).toBe(false);
      expect(buffer.remove()).toEqual(4);
      expect(buffer.remove()).toEqual(5);
      expect(buffer.remove()).toEqual(undefined);
    });
  });

  describe("DroppingBuffer", () => {
    test("simple", () => {
      const buffer = new DroppingBuffer<number>(2);
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      buffer.add(4);
      buffer.add(5);
      expect(buffer.full).toBe(false);
      expect(buffer.remove()).toEqual(1);
      expect(buffer.remove()).toEqual(2);
      expect(buffer.remove()).toEqual(undefined);
    });
  });
});

describe("Channel", () => {
  test("no buffer", async () => {
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

  test("pull then push avoids buffer", async () => {
    const buffer = new FixedBuffer<number>(1);
    let push: (value: number) => Promise<void>;
    const chan = new Channel((push1) => (push = push1), buffer);
    const pullResult = chan.next();
    push!(1000);
    expect(buffer.empty).toBe(true);
    await expect(pullResult).resolves.toEqual({ value: 1000, done: false });
  });

  test("pushes throw when buffer and push queue are full", () => {
    const bufferLength = 3;
    let push: (value: number) => Promise<void>;
    const chan = new Channel<number>(
      (push1) => (push = push1),
      new FixedBuffer(bufferLength),
    );
    for (let i = 0; i < bufferLength + chan["MAX_QUEUE_LENGTH"]; i++) {
      push!(i);
    }
    expect(() => push(-1)).toThrow(ChannelOverflowError);
    expect(() => push(-2)).toThrow(ChannelOverflowError);
  });

  test("pulls throw when pull queue is full", async () => {
    const chan = new Channel(() => {}, new FixedBuffer(3));
    for (let i = 0; i < chan["MAX_QUEUE_LENGTH"]; i++) {
      chan.next();
    }
    await expect(chan.next()).rejects.toBeInstanceOf(ChannelOverflowError);
    await expect(chan.next()).rejects.toBeInstanceOf(ChannelOverflowError);
  });

  test("dropping buffer", async () => {
    const chan = new Channel<number>((push, close) => {
      push(1);
      push(2);
      push(3);
      push(4);
      push(5);
      close();
    }, new DroppingBuffer(3));
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });

  test("sliding buffer", async () => {
    const chan = new Channel<number>((push, close) => {
      push(1);
      push(2);
      push(3);
      push(4);
      push(5);
      close();
    }, new SlidingBuffer(3));
    const result: number[] = [];
    for await (const num of chan) {
      result.push(num);
    }
    expect(result).toEqual([3, 4, 5]);
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
    let result: number[] = [];
    for await (const num of chan) {
      result.push(num);
      if (num === 3) {
        await expect(chan.return()).resolves.toEqual({ done: true });
      }
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).resolves.toEqual({ done: true });
  });
});
