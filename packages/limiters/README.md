# @channel/limiters
This package is experimental!

Basic async iterators for limiting concurrency, implemented with channels

```ts
interface Token {
  readonly id: number;
  readonly limit: number;
  readonly remaining: number;
  release(): void;
}

function semaphore(limit: number): Channel<Token>;

interface ThrottleToken extends Token {
    readonly reset: number;
}

function throttler(wait: number, options?: {
    limit?: number;
    cooldown?: boolean;
}): Channel<ThrottleToken>;
```
