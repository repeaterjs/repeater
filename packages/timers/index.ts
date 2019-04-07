import { Channel, ChannelBuffer, SlidingBuffer } from "@channel/channel";

export function delay(wait: number): Channel<number> {
  return new Channel<number>(async (push, close, stop) => {
    const timer = setTimeout(() => (push(Date.now()), close()), wait);
    await stop;
    clearTimeout(timer);
  });
}

export function timeout(wait: number): Channel<number> {
  return new Channel<number>(async (_, close, stop) => {
    const timer = setTimeout(() => close(new Error(`${wait}ms elapsed`)), wait);
    await stop;
    clearTimeout(timer);
  });
}

export function interval(
  wait: number,
  buffer: ChannelBuffer<number> = new SlidingBuffer(1),
): Channel<number> {
  return new Channel<number>(async (push, _, stop) => {
    push(Date.now());
    const timer = setInterval(() => push(Date.now()), wait);
    await stop;
    clearInterval(timer);
  }, buffer);
}
