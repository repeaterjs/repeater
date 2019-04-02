import { FixedBuffer, SlidingBuffer } from "./buffers";
import { Channel } from "./channel";

export function timeout(
  delay: number,
  options: { reject?: boolean } = {},
): AsyncIterableIterator<number> {
  return new Channel<number>(async (put, close, start, stop) => {
    await start;
    const timer = setTimeout(() => {
      if (options.reject) {
        close(new Error(`${delay} ms elapsed`));
      } else {
        put(Date.now());
        close();
      }
    }, delay);
    await stop;
    clearTimeout(timer);
  });
}

export function interval(
  delay: number,
  buffer: number = 1,
): AsyncIterableIterator<number> {
  return new Channel<number>(async (put, _, start, stop) => {
    await start;
    const timer = setInterval(() => put(Date.now()), delay);
    await stop;
    clearInterval(timer);
  }, new SlidingBuffer(buffer));
}

export interface Token<T> {
  resource?: T;
  remaining: number;
  release(): void;
}

export async function* resources<T>(
  limit: number,
  init?: () => T,
): AsyncIterableIterator<Token<T | undefined>> {
  let remaining = limit;
  let release: (resource?: T) => void;
  const releases = new Channel<T | undefined>(async (put, _, ready) => {
    release = (resource?: T) => {
      remaining++;
      put(resource);
    };
    await ready;
    for (let i = 0; i < limit; i++) {
      put(init && init());
    }
  }, new FixedBuffer(limit));
  for await (const resource of releases) {
    remaining--;
    yield {
      resource,
      remaining,
      release: release!.bind(null, resource),
    };
  }
}
