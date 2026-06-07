---
id: utilities
title: Timers and Limiters
---

As of 3.1, the timer and limiter utilities ship as part of the
`@repeaterjs/repeater` package, available from dedicated subpath exports. You no
longer install a separate package — just import from `@repeaterjs/repeater/timers`
or `@repeaterjs/repeater/limiters`.

> **Migrating from the standalone packages?** The old `@repeaterjs/timers` and
> `@repeaterjs/limiters` packages are deprecated in favor of these subpaths, and
> the helpers gained a `create` prefix: `delay` → `createDelay`, `interval` →
> `createInterval`, `timeout` → `createTimeout`, `semaphore` → `createSemaphore`,
> `throttle` → `createThrottle`. The `@repeaterjs/pubsub` and
> `@repeaterjs/react-hooks` packages are not carried forward.

## Timers

```js
import {
  createDelay,
  createInterval,
  createTimeout,
} from "@repeaterjs/repeater/timers";
```

- **`createDelay(wait)`** — a repeater that yields the current timestamp `wait`
  milliseconds after each call to `next`. Useful for throttling another iterator
  with `Repeater.zip` (see [Combining Async Iterators](/docs/combinators/)).
- **`createInterval(wait)`** — yields the current timestamp every `wait`
  milliseconds, like `setInterval` exposed as an async iterator.
- **`createTimeout(wait)`** — throws a `TimeoutError` if `next` is not called
  within `wait` milliseconds of the previous pull. Raced against another iterator
  with `Repeater.race`, it places an upper bound on each iteration.

```js
import { createInterval } from "@repeaterjs/repeater/timers";

(async () => {
  let count = 0;
  for await (const _ of createInterval(1000)) {
    console.log(`tick ${count++}`);
    if (count >= 3) break; // breaking cleans up the underlying timer
  }
})();
```

Because these are repeaters, calling `return` (or breaking out of a `for await`
loop) clears the underlying `setTimeout`/`setInterval` for you.

## Limiters

```js
import { createSemaphore, createThrottle } from "@repeaterjs/repeater/limiters";
```

- **`createSemaphore(limit)`** — yields up to `limit` tokens at a time, capping
  concurrency. Each token exposes `release()`; call it to return capacity so the
  next waiter can proceed.
- **`createThrottle(wait, options?)`** — yields up to `options.limit` tokens per
  `wait`-millisecond window, capping the *rate* of work rather than its
  concurrency.

```js
import { createSemaphore } from "@repeaterjs/repeater/limiters";

// Run at most two `fetch`es concurrently.
const sem = createSemaphore(2);
async function fetchThrottled(url) {
  const { value: token } = await sem.next();
  try {
    return await fetch(url);
  } finally {
    token.release();
  }
}
```

A token carries `{ id, limit, remaining, release() }`; throttle tokens also
include a `reset` timestamp indicating when the rate window next opens.
