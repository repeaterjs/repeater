import { Channel, DroppingBuffer, FixedBuffer, SlidingBuffer } from "../index";

describe("FixedBuffer", () => {
  test("simple", () => {
    const buffer = new FixedBuffer<number>(2);
    buffer.add(1);
    buffer.add(2);
    expect(buffer.remove()).toEqual(1);
    expect(buffer.remove()).toEqual(2);
    expect(buffer.remove()).toEqual(undefined);
  });

  test("throws when full", () => {
    const buffer = new FixedBuffer<number>(2);
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

  test("fixed buffer rejects when full", async () => {
    new Channel(async (put) => {
      put(1);
      put(2);
      put(3);
      await expect(put(4)).rejects.toBeDefined();
    }, new FixedBuffer<number>(3));
  });

  test("dropping buffer", async () => {
    const channel = new Channel((put) => {
      put(1);
      put(2);
      put(3);
      put(4);
      put(5);
    }, new DroppingBuffer<number>(3));
    let i = 1;
    for await (const num of channel) {
      expect(num).toEqual(i++);
      if (i === 4) {
        break;
      }
    }
    expect(channel.closed).toBe(true);
  });

  test("sliding buffer", async () => {
    const channel = new Channel((put) => {
      put(1);
      put(2);
      put(3);
      put(4);
      put(5);
    }, new SlidingBuffer<number>(3));
    let i = 3;
    for await (const num of channel) {
      expect(num).toEqual(i++);
      if (i === 6) {
        break;
      }
    }
    expect(channel.closed).toBe(true);
  });

  test("throws when pulling multiple values simultaneously", async () => {
    const channel = new Channel<number>((put) => {
      setTimeout(async () => {
        await put(1);
        await put(2);
        await put(3);
      });
    });
    let result = channel.next();
    expect(await result).toEqual({ value: 1, done: false });
    await Promise.all([
      expect(channel.next()).resolves.toEqual({ value: 2, done: false }),
      expect(channel.next()).rejects.toBeDefined(),
    ]);
  });

  test("early break", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await expect(put(4)).rejects.toBeDefined();
    });
    let i = 1;
    for await (const num of channel) {
      expect(num).toEqual(i++);
      if (i === 3) {
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
      await expect(put(4)).rejects.toBeDefined();
    });
    let i = 1;
    const error = new Error("Example error");
    try {
      for await (const num of channel) {
        expect(num).toEqual(i++);
        if (i === 3) {
          throw error;
        }
      }
    } catch (err) {
      expect(err).toEqual(error);
    }
    expect(channel.closed).toBe(true);
  });

  test("throw method", async () => {
    const channel = new Channel<number>(async (put) => {
      await put(1);
      await put(2);
      await put(3);
      await expect(put(4)).rejects.toBeDefined();
    });
    const error = new Error("Example error");
    let result: number[] = [];
    for await (const num of channel) {
      result.push(num);
      if (num === 3) {
        channel.throw(error);
      }
    }
    expect(result).toEqual([1, 2, 3]);
    expect(channel.closed).toBe(true);
  });
});
