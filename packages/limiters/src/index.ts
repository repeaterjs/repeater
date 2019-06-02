import { Channel, FixedBuffer } from "@channel/channel";
import { delay } from "@channel/timers";

export interface Token {
  readonly id: number;
  readonly limit: number;
  readonly remaining: number;
  release(): void;
}

export function semaphore(limit: number): Channel<Token> {
  if (limit < 1) {
    throw new RangeError("limit cannot be less than 1");
  }
  let remaining = limit;
  const tokens: Record<number, Token> = {};
  const bucket = new Channel<Token>((push) => {
    let nextId = 0;
    function release(this: null, id: number): void {
      if (tokens[id] != null) {
        const id1 = nextId++;
        const token = {
          ...tokens[id],
          id: id1,
          release: release.bind(null, id1),
        };
        push(token);
        delete tokens[id];
        remaining++;
      }
    }
    for (let i = 0; i < limit; i++) {
      const id = nextId++;
      const token: Token = {
        id,
        limit,
        remaining,
        release: release.bind(null, id),
      };
      push(token);
    }
  }, new FixedBuffer(limit));
  return new Channel<Token>(async (push, _, stop) => {
    let stopped = false;
    stop.then(() => (stopped = true));
    for await (let token of Channel.race([bucket, stop])) {
      if (stopped) {
        break;
      }
      remaining--;
      token = { ...token, remaining };
      tokens[token.id] = token;
      await push(token);
    }
  });
}

// TODO: implement a resource pool

export interface ThrottleToken extends Token {
  readonly reset: number;
}

// TODO: is it possible to express leading/trailing logic from lodash with async iterators?
export function throttler(
  wait: number,
  options: { limit?: number } = {},
): Channel<ThrottleToken> {
  const { limit = 1 } = options;
  if (limit < 1) {
    throw new RangeError("options.limit cannot be less than 1");
  }
  return new Channel<ThrottleToken>(async (push, close, stop) => {
    const timer = delay(wait);
    const tokens = new Set<Token>();
    let time = Date.now();
    let leaking = false;
    async function leak(): Promise<void> {
      if (leaking) {
        return;
      }
      time = Date.now();
      leaking = true;
      await timer.next();
      for (const token of tokens) {
        token.release();
      }
      tokens.clear();
      leaking = false;
    }
    let stopped = false;
    stop.then(() => (stopped = true));
    for await (const token of Channel.race([semaphore(limit), stop])) {
      if (stopped) {
        break;
      }
      tokens.add(token);
      leak();
      await push({ ...token, reset: time + wait });
    }
    tokens.clear();
    await timer.return();
  });
}
