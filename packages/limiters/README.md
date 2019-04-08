# @channel/limiters
Basic async iterators for limiting concurrency, implemented with channels

```ts
interface Token {
  readonly id: number;
  readonly limit: number;
  remaining: number;
  release(): void;
}

function semaphore(limit: number): AsyncIterableIterator<Token>;
```

```ts
interface ThrottleToken extends Token {
  reset: number;
}

throttler(wait: number, limit?: number): AsyncIterableIterator<ThrottleToken>;
```
