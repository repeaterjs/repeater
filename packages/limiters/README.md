# @channel/limiters
This package is experimental!

Basic async iterators for limiting concurrency, implemented with channels

```ts
interface Token {
  readonly id: number;
  readonly limit: number;
  remaining: number;
  release(): void;
}

function semaphore(limit: number): AsyncIterableIterator<Token>;

interface ThrottleToken extends Token {
  reset: number;
}

function throttler(wait: number, limit?: number): AsyncIterableIterator<ThrottleToken>;
```
