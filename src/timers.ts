import { Buffer, SlidingBuffer } from "./buffers";
import { Channel } from "./channel";

export function delay(wait: number): Channel<number> {
  return new Channel<number>(async (push, close, start, stop) => {
    await start;
    const timer = setTimeout(() => (push(Date.now()), close()), wait);
    await stop;
    clearTimeout(timer);
  });
}

export function timeout(wait: number): Channel<number> {
  return new Channel<number>(async (_, close, start, stop) => {
    await start;
    const timer = setTimeout(() => close(new Error(`${wait}ms elapsed`)), wait);
    await stop;
    clearTimeout(timer);
  });
}

export function interval(
  wait: number,
  buffer: Buffer<number> = new SlidingBuffer(1),
): Channel<number> {
  return new Channel<number>(async (push, _, start, stop) => {
    await start;
    push(Date.now());
    const timer = setInterval(() => push(Date.now()), wait);
    await stop;
    clearInterval(timer);
  }, buffer);
}
