import { FixedBuffer } from "./buffers";
import { Channel } from "./channel";
import { interval } from "./timers";
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
  // TODO: allow release to destroy resources and create another one. This will probably make release an async function
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
  // TODO: release and destroy all resources when the generator is closed
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
  }
}
