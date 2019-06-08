---
id: combinators 
title: Combining Async Iterators
---

Combining async iterators is a [non-trivial task](https://stackoverflow.com/questions/50585456/how-can-i-interleave-merge-async-iterables), and the `Channel` class provide four static methods inspired by `Promise.race` and `Promise.all` which provide different strategies for combining async iterators.

## `Channel.race`

`Channel.race` takes an iterable of async iterators and races iterations from each iterator using `Promise.race` and yielding the value which resolved first. One important use-case is to place a fixed upper bound on how long each iteration of an async iterator can take:

```js
import { Channel } from "@channel/channel";
import { timeout } from "@channel/timers";

const chan = new Channel(async (push) => {
  await push(1);
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await push(3);
});

try {
  (async () => {
    for await (const num of Channel.race([chan, timeout(1000)])) {
      console.log(num); // 1, 2
    }
  })();
} catch (err) {
  console.log(err); // TimeoutError: 1000 ms elapsed
}
```

The `timeout` function is a useful channel-based utility which errors if `next` is not called within a specified period of time. In the above example, each iteration has one second to resolve or the iterator throws.

You can also pass a promise to `Channel.race` in which case the entire iteration will be raced against the promise:

```js
import { Channel } from "@channel/channel";
import { timeout } from "@channel/timers";

const chan = new Channel(async (push) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(1);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(3);
});
const timer = timeout(2000);

try {
  (async () => {
    for await (const num of Channel.race([chan, timer.next()])) {
      console.log(num); // 1, 2
    }
  })();
} catch (err) {
  console.log(err); // TimeoutError: 2000 ms elapsed
} finally {
  await timer.return();
}
```

Note that it is important to call `timer.return` manually in a `finally` block to ensure there are no unhandled promise rejections.

## `Channel.merge`

`Channel.merge` takes an iterable of async iterators and returns a channel which yields values whenever any of the child iterators yield values. This method is useful for when you have multiple async iterators from different sources and want to consume values from all of them in the order in which they occur.

```js
import { Channel } from "@channel/channel";
const leftClicks = new Channel(async (push, stop) => {
  const listener = (ev) => push({ type: "left", event: ev });
  window.addEventListener("click", listener);
  await stop;
  window.removeEventListener("click", listener);
});
const rightClicks = new Channel(async (push, stop) => {
  const listener = (ev) => push({ type: "right", event: ev });
  window.addEventListener("contextmenu", listener);
  await stop;
  window.removeEventListener("contextmenu", listener);
});

(async () => {
  for await (const click of Channel.merge([leftClicks, rightClicks])) {
    console.log(click);
  }
})();
```

## `Channel.zip`

`Channel.zip` takes an iterable of async iterators and returns a channel which awaits every iteration from every iterator using `Promise.all`, yielding the resulting array.

** TODO: provide a useful example **

## `Channel.latest`

`Channel.latest` takes an iterable of async iterators and returns a channel which yields an array of the latest values from each iterator whenever any of the iterators yields a value.

** TODO: provide a useful example **
