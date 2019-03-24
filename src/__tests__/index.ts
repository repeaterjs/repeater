import {
  FixedBuffer,
  SlidingBuffer,
  DroppingBuffer,
  Channel,
} from "../index";

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
    const channel = new Channel<number>();
    setTimeout(async () => {
      await channel.put(1);
      await channel.put(2);
      await channel.put(3);
      await channel.put(4);
      await channel.put(5);
      channel.close();
    });
    const result: number[] = [];
    for await (const num of channel) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test("fixed buffer", async () => {
    const channel = new Channel(new FixedBuffer<number>(3));
    channel.put(1);
    channel.put(2);
    channel.put(3);
    await expect(channel.put(4)).rejects.toBeDefined();
  });

  test("dropping buffer", async () => {
    const channel = new Channel(new DroppingBuffer<number>(3));
    channel.put(1);
    channel.put(2);
    channel.put(3);
    channel.put(4);
    channel.put(5);
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
    const channel = new Channel(new SlidingBuffer<number>(3));
    channel.put(1);
    channel.put(2);
    channel.put(3);
    channel.put(4);
    channel.put(5);
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
    const channel = new Channel<number>();
    setTimeout(async () => {
      await channel.put(1);
      await channel.put(2);
      await channel.put(3);
    });
    let result = channel.next();
    expect(await result).toEqual({ value: 1, done: false });
    await Promise.all([
      expect(channel.next()).resolves.toEqual({ value: 2, done: false }),
      expect(channel.next()).rejects.toBeDefined(),
    ]);
  });

  test("early break", async () => {
    const channel = new Channel<number>();
    const puts = (async () => {
      await channel.put(1);
      await channel.put(2);
      await channel.put(3);
      return channel.put(4);
    })();
    let i = 1;
    for await (const num of channel) {
      expect(num).toEqual(i++);
      if (i === 3) {
        break;
      }
    }
    await expect(puts).rejects.toBeDefined();
    expect(channel.closed).toBe(true);
  });

  test("early throw", async () => {
    const channel = new Channel<number>();
    const puts = (async () => {
      await channel.put(1);
      await channel.put(2);
      await channel.put(3);
      return channel.put(4);
    })();
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
    await expect(puts).rejects.toBeDefined();
    expect(channel.closed).toBe(true);
  });

  test("throw method", async () => {
    const channel = new Channel<number>();
    const error = new Error("Example error");
    const puts = (async () => {
      await channel.put(1);
      await channel.put(2);
      await channel.put(3);
      await channel.throw(error);
      return channel.put(4);
    })();
    let result: number[] = [];
    for await (const num of channel) {
      result.push(num);
    }
    expect(result).toEqual([1, 2, 3]);
    await expect(puts).rejects.toBeDefined();
    expect(channel.closed).toBe(true);
  });
});
