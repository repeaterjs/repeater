import { Channel, FixedBuffer } from "@channel/channel";
import { interval } from "@channel/timers";

export interface Token {
  readonly id: number;
  readonly limit: number;
  remaining: number;
  release(): void;
}

export async function* semaphore(limit: number): AsyncIterableIterator<Token> {
  let remaining = limit;
  const released: Record<string, Token> = {};
  const tokens = new Channel<Token>(async (push, _, stop) => {
    function release(id: number) {
      if (released[id] != null) {
        push(released[id]);
        delete released[id];
        remaining++;
      }
    }
    let stopped = false;
    stop.then(() => (stopped = true));
    for (let id = 0; id < limit; id++) {
      const token = { id, limit, remaining, release: release.bind(null, id) };
      await Promise.race([stop, push(token)]);
      if (stopped) {
        break;
      }
    }
  }, new FixedBuffer(limit));
  for await (let token of tokens) {
    remaining--;
    token = { ...token, remaining };
    released[token.id] = token;
    yield token;
  }
}

export interface TimerToken extends Token {
  reset: number;
}

export async function* throttler(
  wait: number,
  limit: number = 1,
): AsyncIterableIterator<TimerToken> {
  const timer = interval(wait);
  const tokens = new Set<Token>();
  let time = Date.now();
  (async function leak() {
    for await (time of timer) {
      for (const token of tokens) {
        token.release();
      }
      tokens.clear();
    }
  })();
  try {
    for await (const token of semaphore(limit)) {
      yield { ...token, reset: time + wait };
      tokens.add(token);
    }
  } finally {
    timer.return();
  }
}
