import { Channel, FixedBuffer } from "@channel/channel";
import { delay } from "@channel/timers";

export interface Token {
  readonly id: number;
  readonly limit: number;
  readonly remaining: number;
  release(): void;
}

export async function* semaphore(limit: number): AsyncIterableIterator<Token> {
  let remaining = limit;
  const released: Record<string, Token> = {};
  const tokens = new Channel<Token>(async (push) => {
    function release(id: number) {
      if (released[id] != null) {
        push(released[id]);
        delete released[id];
        remaining++;
      }
    }
    for (let id = 0; id < limit; id++) {
      const token = { id, limit, remaining, release: release.bind(null, id) };
      await push(token);
    }
  }, new FixedBuffer(limit));
  for await (let token of tokens) {
    remaining--;
    token = { ...token, remaining };
    released[token.id] = token;
    yield token;
  }
}

// TODO: implement a resource pool

export interface ThrottleToken extends Token {
  readonly reset: number;
}

// TODO: is it possible to express leading/trailing logic from lodash with async iterators?
export async function* throttler(
  wait: number,
  limit: number = 1,
): AsyncIterableIterator<ThrottleToken> {
  const timer = delay(wait);
  const tokens = new Set<Token>();
  let time = Date.now();
  let leaking = false;
  async function leak(): Promise<void> {
    if (leaking) {
      return;
    }
    leaking = true;
    time = (await timer.next()).value;
    leaking = false;
    for (const token of tokens) {
      token.release();
    }
    tokens.clear();
  }
  try {
    const bucket = semaphore(limit);
    for await (const token of bucket) {
      leak();
      tokens.add(token);
      yield { ...token, reset: time + wait };
    }
  } finally {
    for (const token of tokens) {
      token.release();
    }
    tokens.clear();
    await timer.return();
  }
}

// TODO: implement a debouncer
