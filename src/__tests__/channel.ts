import { Channel, DroppingBuffer, FixedBuffer, SlidingBuffer } from "../index";

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

  test("take then push avoids buffer", async () => {
    const buffer = new FixedBuffer<number>(1);
    let push: (value: number) => Promise<void>;
    const chan = new Channel((push1) => (push = push1), buffer);
    const takeResult = chan.next();
    push!(1000);
    expect(buffer.empty).toBe(true);
    await expect(takeResult).resolves.toEqual({ value: 1000, done: false });
  });

  test("pushes throw when buffer and queue are full", () => {
    let push: (value: number) => Promise<void>;
    const chan = new Channel<number>(
      (push1) => (push = push1),
      new FixedBuffer(3),
    );
    // @ts-ignore
    chan.MAX_QUEUE_LENGTH = 0;
    push!(1);
    push!(2);
    push!(3);
    expect(() => push(4)).toThrow();
    expect(() => push(5)).toThrow();
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
      if (num === 2) {
        break;
      }
    }
    expect(result).toEqual([1, 2]);
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

  test("throw method", async () => {
    const chan = new Channel<number>(async (push) => {
      await push(1);
      await push(2);
      await push(3);
      await push(4);
    });
    const error = new Error("Error thrown via method error");
    let result: number[] = [];
    await expect(
      (async () => {
        for await (const num of chan) {
          result.push(num);
          if (num === 3) {
            await chan.throw(error);
          }
        }
      })(),
    ).rejects.toBe(error);
    expect(result).toEqual([1, 2, 3]);
    await expect(chan.next()).rejects.toBe(error);
    await expect(chan.next()).rejects.toBe(error);
  });
});
