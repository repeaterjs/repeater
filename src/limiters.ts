import { Repeater, FixedBuffer } from "./core.js";
import { race } from "./combinators.js";
import { createDelay } from "./timers.js";
import { safeRace } from "./_utils.js";

export interface Token {
  readonly id: number;
  readonly limit: number;
  readonly remaining: number;
  release(): void;
}

export function createSemaphore(limit: number): Repeater<Token> {
  if (limit < 1) {
    throw new RangeError("limit cannot be less than 1");
  }

  let remaining = limit;
  const tokens: Record<number, Token> = {};
  const bucket = new Repeater<Token>((push) => {
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

  return new Repeater<Token>(async (push, stop) => {
    let stopped = false;
    stop.then(() => (stopped = true));
    for await (const token of race([bucket, stop])) {
      if (stopped) {
        break;
      }

      remaining--;
      const token1 = { ...token, remaining };
      tokens[token1.id] = token1;
      await push(token1);
    }
  });
}

export interface ThrottleToken extends Token {
  readonly reset: number;
}

export function createThrottle(
  wait: number,
  options: { limit?: number; cooldown?: boolean } = {},
): Repeater<ThrottleToken> {
  const { limit = 1, cooldown = false } = options;
  if (limit < 1) {
    throw new RangeError("options.limit cannot be less than 1");
  }

  return new Repeater<ThrottleToken>(async (push, stop) => {
    const timer = createDelay(wait);
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
    for await (const token of race([createSemaphore(limit), stop])) {
      if (stopped) {
        break;
      }

      leaking = leak();
      let token1: ThrottleToken = { ...token, reset: start + wait };
      tokens.add(token1);
      if (cooldown && token.remaining === 0) {
        await safeRace([stop, leaking]);
        token1 = { ...token1, remaining: limit };
      }

      await push(token1);
    }

    tokens.clear();
    await timer.return();
  });
}
