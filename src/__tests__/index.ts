import { Channel, DroppingBuffer, FixedBuffer, SlidingBuffer } from "../index";

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
    const error = new Error("Hi");
    const channel = new Channel<number>(() => {
      throw error;
    });
    await expect(channel.next()).rejects.toBe(error);
  });

  test("async error in executor", async () => {
    const error = new Error("Hi");
    const channel = new Channel<number>(async () => {
      throw error;
    });
    await expect(channel.next()).rejects.toBe(error);
  });

  test("fixed buffer rejects when buffer and queue are full", async () => {
    const channel = new Channel<number>((put, close) => {
      put(1);
      put(2);
      put(3);
      put(4);
      put(5);
      close();
    }, new FixedBuffer(3));
    // @ts-ignore
    channel.MAX_QUEUE_LENGTH = 0;
    const result: number[] = [];
    for await (const num of channel) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
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
    });
    for await (const num of channel) {
      if (num === 2) {
        break;
      }
    }
    expect(channel.closed).toBe(true);
  });

  test("early throw", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await put(4);
    });
    const error = new Error("Example error");
    const result = [];
    try {
      for await (const num of channel) {
        result.push(num);
        if (num === 3) {
          throw error;
        }
      }
    } catch (err) {
      expect(err).toEqual(error);
    }
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });

  test("return method", async () => {
    const channel = new Channel<number>((put) => {
      put(1);
      put(2);
      put(3);
      put(4);
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
  });

  test("throw method", async () => {
    const channel = new Channel<number>((put) => {
      put(1);
      put(2);
      put(3);
      put(4);
    });
    const error = new Error("Example error1");
    let result: number[] = [];
    try {
      for await (const num of channel) {
        result.push(num);
        if (num === 3) {
          channel.throw(error);
        }
      }
    } catch (err) {
      expect(err).toBe(error);
    }
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });
});
