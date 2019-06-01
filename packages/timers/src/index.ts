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

interface Timer {
  resolve(timestamp: number): void;
  reject(err: TimeoutError): void;
  // The type returned by setTimeout and passed to clearTimeout. This type
  // differs between the browser (number) and node.js (NodeJS.Timer).
  timeout: any;
}

export function delay(wait: number): Channel<number> {
  return new Channel(async (push, _close, stop) => {
    let timers: Set<Timer> = new Set();
    let stopped = false;
    stop.then(() => (stopped = true));
    do {
      let resolve: (timestamp: number) => void;
      let reject: (err: TimeoutError) => void;
      await push(
        new Promise<number>((resolve1, reject1) => {
          resolve = resolve1;
          reject = reject1;
        }),
      );
      const timer: Timer = {
        resolve: resolve!,
        reject: reject!,
        timeout: setTimeout(() => {
          timers.delete(timer);
          resolve(Date.now());
        }, wait),
      };
      timers.add(timer);
    } while (!stopped);
    for (const timer of timers) {
      clearTimeout(timer.timeout);
      // Because channels swallow rejections which settle after stop, we use
      // this mechanism to make pending calls to next return `{ done: true }`.
      timer.reject(new TimeoutError("THIS ERROR SHOULD NEVER BE SEEN"));
    }
  });
}

export function timeout(wait: number): Channel<number> {
  return new Channel(async (push, _close, stop) => {
    let timer: Timer | undefined;
    let stopped = false;
    stop.then(() => (stopped = true));
    do {
      let resolve: (timestamp: number) => void;
      let reject: (err: TimeoutError) => void;
      await push(
        new Promise<number>((resolve1, reject1) => {
          resolve = resolve1;
          reject = reject1;
        }),
      );
      if (timer != null) {
        timer.resolve(Date.now());
      }
      timer = {
        resolve: resolve!,
        reject: reject!,
        timeout: setTimeout(() => {
          reject(
            new TimeoutError(`${wait}ms elapsed without next being called`),
          );
        }, wait),
      };
    } while (!stopped);
    if (timer != null) {
      // Because channels swallow rejections which settle after stop, we use
      // this mechanism to make pending calls to next return `{ done: true }`.
      timer.reject(new TimeoutError("THIS ERROR SHOULD NEVER BE SEEN"));
    }
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
