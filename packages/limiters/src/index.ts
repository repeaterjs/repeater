import { Channel, FixedBuffer } from "@repeaterjs/repeater";
import { delay } from "@repeaterjs/timers";

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
  return new Channel<Token>(async (push, stop) => {
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

export function throttler(
  wait: number,
  options: { limit?: number; cooldown?: boolean } = {},
): Channel<ThrottleToken> {
  const { limit = 1, cooldown = false } = options;
  if (limit < 1) {
    throw new RangeError("options.limit cannot be less than 1");
  }
  return new Channel<ThrottleToken>(async (push, stop) => {
    const timer = delay(wait);
    const tokens = new Set<Token>();
    let start = Date.now();
    let leaking: Promise<void> | undefined;
    async function leak(): Promise<void> {
      if (leaking != null) {
        return leaking;
      }
      start = Date.now();
      await timer.next();
      for (const token of tokens) {
        token.release();
      }
      tokens.clear();
      // eslint-disable-next-line require-atomic-updates
      leaking = undefined;
    }

    let stopped = false;
    stop.then(() => (stopped = true));
    for await (let token of Channel.race([semaphore(limit), stop])) {
      if (stopped) {
        break;
      }
      leaking = leak();
      token = { ...token, reset: start + wait };
      tokens.add(token);
      if (cooldown && token.remaining === 0) {
        await Promise.race([stop, leaking]);
        token = { ...token, remaining: limit };
      }
      await push(token);
    }
    tokens.clear();
    await timer.return();
  });
}
