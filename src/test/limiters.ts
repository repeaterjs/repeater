import { describe, test, expect } from "@b9g/libuild/test";
import * as Sinon from "sinon";
import { createSemaphore, createThrottle } from "../limiters.js";

describe("limiters", () => {
  test("createSemaphore", async () => {
    const tokens = createSemaphore(4);
    let i = 0;
    for await (const token of tokens) {
      expect(token.id).toBe(i);
      expect(token.remaining).toBe(3);
      i++;
      token.release();
      if (i > 100) {
        break;
      }
    }
  });

  test("createSemaphore remaining", async () => {
    const tokens = createSemaphore(4);
    const t1 = (await tokens.next()).value;
    expect(t1.remaining).toEqual(3);
    const t2 = (await tokens.next()).value;
    expect(t2.remaining).toEqual(2);
    const t3 = (await tokens.next()).value;
    expect(t3.remaining).toEqual(1);
    const t4 = (await tokens.next()).value;
    expect(t4.remaining).toEqual(0);
    t1.release();
    t2.release();
    const t5 = (await tokens.next()).value;
    expect(t5.remaining).toEqual(1);
    t3.release();
    const t6 = (await tokens.next()).value;
    expect(t6.remaining).toEqual(1);
    await tokens.return();
  });

  test("createThrottle", async () => {
    let prev = Date.now();
    let i = 0;
    const wait = 200;
    for await (const _ of createThrottle(wait, { limit: 8 })) {
      const next = Date.now();
      if (i !== 0 && i % 8 === 0) {
        expect(prev + wait).toBeCloseTo(next, -1.5);
      } else {
        expect(prev).toBeCloseTo(next, -1.5);
      }
      if (i >= 40) {
        break;
      }
      i++;
      prev = next;
    }
  });

  test("createThrottle timer window slides", async () => {
    let prev = Date.now();
    let i = 0;
    const wait = 200;
    const spy = Sinon.spy(globalThis, "setTimeout");
    try {
      for await (const _ of createThrottle(wait, { limit: 8 })) {
        const next = Date.now();
        expect(prev).toBeCloseTo(next, -1.5);
        if (i % 8 === 0) {
          await new Promise((resolve) => setTimeout(resolve, wait * 2));
        }

        if (i >= 40) {
          break;
        }

        i++;
        prev = Date.now();
      }

      // called 6 times by delay timer, 6 times by the promise
      expect(spy.callCount).toBe(12);
    } finally {
      spy.restore();
    }
  });

  test("createThrottle token reset", async () => {
    let i = 0;
    const wait = 200;
    for await (const token of createThrottle(wait, { limit: 8 })) {
      expect(token.reset).toBeCloseTo(Date.now() + wait, -1.5);
      if (i >= 40) {
        break;
      }

      i++;
    }
  });

  test("createThrottle token remaining", async () => {
    let remaining = 8;
    let i = 0;
    const wait = 200;
    for await (const token of createThrottle(wait, { limit: 8 })) {
      remaining--;
      expect(token.remaining).toEqual(remaining);
      if (token.remaining === 0) {
        remaining = 8;
      }

      i++;
      if (i >= 40) {
        break;
      }
    }
  });

  test("createThrottle with cooldown", async () => {
    let i = 0;
    const wait = 200;
    let prev = Date.now();
    for await (const _ of createThrottle(wait, { cooldown: true })) {
      const next = Date.now();
      expect(prev + wait).toBeCloseTo(next, -1.5);
      if (i >= 4) {
        break;
      }

      i++;
      prev = next;
    }
  });

  test("createThrottle cleans up", async () => {
    const setTimeoutSpy = Sinon.spy(globalThis, "setTimeout");
    const clearTimeoutSpy = Sinon.spy(globalThis, "clearTimeout");
    try {
      const throttle = createThrottle(200, { limit: 8 });
      await throttle.next();
      expect(setTimeoutSpy.callCount).toBe(1);
      await expect(throttle.return()).resolves.toEqual({ done: true });
      expect(clearTimeoutSpy.callCount).toBe(1);
      await expect(throttle.next()).resolves.toEqual({ done: true });
    } finally {
      setTimeoutSpy.restore();
      clearTimeoutSpy.restore();
    }
  });

  test("createSemaphore throws for limit < 1", () => {
    expect(() => createSemaphore(0)).toThrow(RangeError);
  });

  test("createThrottle throws for limit < 1", () => {
    expect(() => createThrottle(100, { limit: 0 })).toThrow(RangeError);
  });
});
