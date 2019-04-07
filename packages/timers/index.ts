import { Channel, ChannelBuffer, SlidingBuffer } from "@channel/channel";

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
    if (typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(this, new.target.prototype);
    } else {
      (this as any).__proto__ = new.target.prototype;
    }
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, TimeoutError);
    }
  }
}

export function delay(
  wait: number,
  options: { reject?: boolean } = {},
): Channel<number> {
  return new Channel<number>(async (push, close, stop) => {
    const timer = setTimeout(async () => {
      if (options.reject == null) {
        await push(Date.now());
        close();
      } else {
        close(new TimeoutError(`${wait} milliseconds elapsed`));
      }
    }, wait);
    await stop;
    clearTimeout(timer);
  });
}

export function timeout<T>(wait: number, promise?: Promise<T>): Promise<T> {
  const timer = delay(wait, { reject: true });
  if (promise == null) {
    return (timer.next() as unknown) as Promise<T>;
  }
  const result = Promise.race([promise, timer.next()]);
  result.catch(() => {}).finally(() => timer.return());
  return result as Promise<T>;
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
