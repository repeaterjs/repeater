import { DroppingBuffer, FixedBuffer, SlidingBuffer } from "../index";

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
