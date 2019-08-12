import {
  DroppingBuffer,
  FixedBuffer,
  SlidingBuffer,
  InfiniteCapacityBuffer
} from "../index";

describe("ChannelBuffer", () => {
  test("FixedBuffer", () => {
    const buffer = new FixedBuffer<number>(2);
    expect([buffer.empty, buffer.full]).toEqual([true, false]);
    buffer.add(1);
    expect([buffer.empty, buffer.full]).toEqual([false, false]);
    buffer.add(2);
    expect([buffer.empty, buffer.full]).toEqual([false, true]);
    expect(() => buffer.add(3)).toThrow();
    expect(buffer.remove()).toEqual(1);
    expect([buffer.empty, buffer.full]).toEqual([false, false]);
    expect(buffer.remove()).toEqual(2);
    expect([buffer.empty, buffer.full]).toEqual([true, false]);
    expect(() => buffer.remove()).toThrow();
  });

  test("SlidingBuffer", () => {
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
    expect(() => buffer.remove()).toThrow();
  });

  test("DroppingBuffer", () => {
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
    expect(() => buffer.remove()).toThrow();
  });

  test("InfiniteCapacityBuffer", () => {
    const buffer = new InfiniteCapacityBuffer<number>();
    expect([buffer.empty, buffer.full]).toEqual([true, false]);

    for (let i = 0; i < 100; i++) {
      buffer.add(i + 1);
    }

    expect([buffer.empty, buffer.full]).toEqual([false, false]);

    for (let i = 0; i < 100; i++) {
      expect(buffer.remove()).toEqual(i + 1);
    }

    expect([buffer.empty, buffer.full]).toEqual([true, false]);
    expect(() => buffer.remove()).toThrow();
  });
});
