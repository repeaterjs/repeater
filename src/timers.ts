import { FixedBuffer, SlidingBuffer } from "./buffers";
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
  bufferLength: number = 1,
): Channel<number> {
  return new Channel<number>(async (push, _, start, stop) => {
    await start;
    const timer = setInterval(() => push(Date.now()), wait);
    await stop;
    clearInterval(timer);
  }, new SlidingBuffer(bufferLength));
}

export interface ResourceToken<T> {
  resource?: T;
  remaining: number;
  release(): void;
}

export async function* resources<T>(
  max: number,
  // TODO: allow create to return a promise
  create?: () => T,
  // TODO: add another callback for destroying resources
): AsyncIterableIterator<ResourceToken<T | undefined>> {
  let remaining = max;
  let release: (resource?: T) => void;
  const releases = new Channel<T | undefined>(async (push, _, start) => {
    release = (resource?: T) => {
      remaining++;
      push(resource);
    };
    await start;
    for (let i = 0; i < max; i++) {
      const resource = create && create();
      await push(resource);
    }
  }, new FixedBuffer(max));
  for await (const resource of releases) {
    remaining--;
    yield {
      resource,
      remaining,
      release: release!.bind(null, resource),
    };
  }
}

export interface LimiterInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// TODO: think about the name of this function for a bit
export async function* limiter(
  rate: number,
  limit: number = 1,
): AsyncIterableIterator<LimiterInfo> {
  const timer = interval(rate);
  const tokens = new Set<ResourceToken<any>>();
  let time = Date.now();
  (async () => {
    for await (time of timer) {
      for (const token of tokens) {
        token.release();
      }
      tokens.clear();
    }
  })();
  try {
    for await (const token of resources(limit)) {
      yield {
        limit,
        remaining: token.remaining,
        reset: time + rate,
      };
      tokens.add(token);
    }
  } finally {
    timer.return();
    for (const token of tokens) {
      token.release();
    }
    tokens.clear();
  }
}
