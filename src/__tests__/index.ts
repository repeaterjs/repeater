import {
  Channel,
  DroppingBuffer,
  FixedBuffer,
  SlidingBuffer,
  interval,
  timeout,
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
    const channel = new Channel<number>(async (put, close) => {
      await put(1);
      await put(2);
      await put(3);
      await put(4);
      await put(5);
      close();
    });
    const result: number[] = [];
    for await (const num of channel) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test("sync error in executor", async () => {
    const error = new Error("Sync error in executor");
    const channel = new Channel<number>(() => {
      throw error;
    });
    await expect(channel.next()).rejects.toBe(error);
    expect(channel.closed).toBe(true);
  });

  test("async error in executor", async () => {
    const error = new Error("Async error in executor");
    const channel = new Channel<number>(async () => {
      throw error;
    });
    await expect(channel.next()).rejects.toBe(error);
    expect(channel.closed).toBe(true);
  });

  test("take then put avoids buffer", async () => {
    const buffer = new FixedBuffer<number>(1);
    let put: (value: number) => Promise<void>;
    const channel = new Channel((put1) => (put = put1), buffer);
    const takeResult = channel.next();
    put!(1000);
    expect(buffer.empty).toBe(true);
    await expect(takeResult).resolves.toEqual({ value: 1000, done: false });
  });

  test("puts throw when buffer and queue are full", () => {
    let put: (value: number) => Promise<void>;
    const channel = new Channel<number>(
      (put1) => (put = put1),
      new FixedBuffer(3),
    );
    // @ts-ignore
    channel.MAX_QUEUE_LENGTH = 0;
    put!(1);
    put!(2);
    put!(3);
    expect(() => put(4)).toThrow();
    expect(() => put(5)).toThrow();
  });

  test("dropping buffer", async () => {
    const channel = new Channel<number>((put, close) => {
      put(1);
      put(2);
      put(3);
      put(4);
      put(5);
      close();
    }, new DroppingBuffer(3));
    const result: number[] = [];
    for await (const num of channel) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });

  test("sliding buffer", async () => {
    const channel = new Channel<number>((put, close) => {
      put(1);
      put(2);
      put(3);
      put(4);
      put(5);
      close();
    }, new SlidingBuffer(3));
    const result: number[] = [];
    for await (const num of channel) {
      result.push(num);
    }
    expect(result).toEqual([3, 4, 5]);
    expect(channel.closed).toBe(true);
  });

  test("early break", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await put(4);
    });
    const result: number[] = [];
    for await (const num of channel) {
      result.push(num);
      if (num === 2) {
        break;
      }
    }
    expect(result).toEqual([1, 2]);
    expect(channel.closed).toBe(true);
  });

  test("early throw", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await put(4);
    });
    const error = new Error("Error thrown with throw");
    const result: number[] = [];
    await expect(
      (async () => {
        for await (const num of channel) {
          result.push(num);
          if (num === 3) {
            throw error;
          }
        }
      })(),
    ).rejects.toBe(error);
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });

  test("return method", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await put(4);
    });
    let result: number[] = [];
    for await (const num of channel) {
      result.push(num);
      if (num === 3) {
        // return will ignore any values passed into it
        channel.return("POOP");
      }
    }
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });

  test("throw method", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await put(4);
    });
    const error = new Error("Error thrown via method error");
    let result: number[] = [];
    await expect(
      (async () => {
        for await (const num of channel) {
          result.push(num);
          if (num === 3) {
            channel.throw(error);
          }
        }
      })(),
    ).rejects.toBe(error);
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });
});
