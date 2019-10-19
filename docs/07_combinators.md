---
id: combinators 
title: Combining Async Iterators
---

Combining async iterators is a [non-trivial task](https://stackoverflow.com/questions/50585456/how-can-i-interleave-merge-async-iterables), and the `Repeater` class defines four static methods similar to `Promise.race` and `Promise.all` which allow you to combine async iterators in different ways. These methods can be used to write applications in the [reactive programming](https://en.wikipedia.org/wiki/Reactive_programming) paradigm.

## `Repeater.race`

`Repeater.race` takes an iterable of async iterators and races iterations from each iterator using `Promise.race`, yielding the value which resolved first. One important use-case is to place a fixed upper bound on how long each iteration of an async iterator can take:

```js
import { Repeater } from "@repeaterjs/repeater";
import { timeout } from "@repeaterjs/timers";

const chan = new Repeater(async (push) => {
  await push(1);
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await push(3);
});

(async () => {
  try {
    for await (const num of Repeater.race([chan, timeout(1000)])) {
      console.log(num); // 1, 2
    }
  } catch (err) {
    console.log(err); // TimeoutError: 1000 ms elapsed
  }
})();
```

The `timeout` function is a useful repeater-based utility which errors if `next` is not called within a specified period of time. In the above example, each iteration has one second to resolve or the iterator throws.

You can also pass a promise to `Repeater.race` in which case the entire iteration will be raced against the promise:

```js
import { Repeater } from "@repeaterjs/repeater";
import { timeout } from "@repeaterjs/timers";

const chan = new Repeater(async (push) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(1);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(3);
});
const timer = timeout(2000);

(async () => {
  try {
    for await (const num of Repeater.race([chan, timer.next()])) {
      console.log(num); // 1, 2
    }
  } catch (err) {
    console.log(err); // TimeoutError: 2000 ms elapsed
  } finally {
    await timer.return();
  }
})();
```

Note that it is important to call `timer.return` manually in a `finally` block to close the timer and ensure there are no unhandled promise rejections.

## `Repeater.merge`

`Repeater.merge` takes an iterable of async iterators and returns a repeater which yields values whenever any of the child iterators yield values. This method is useful for when you have multiple async iterators from different sources and want to consume values from all of them in the order in which they occur.

```js
import { Repeater } from "@repeaterjs/repeater";
const leftClicks = new Repeater(async (push, stop) => {
  const listener = (ev) => push("left");
  window.addEventListener("click", listener);
  await stop;
  window.removeEventListener("click", listener);
});
const rightClicks = new Repeater(async (push, stop) => {
  const listener = (ev) => push("right");
  window.addEventListener("contextmenu", listener);
  await stop;
  window.removeEventListener("contextmenu", listener);
});

(async () => {
  for await (const click of Repeater.merge([leftClicks, rightClicks])) {
    console.log(click); // left, left, right, left, right
  }
})();
```

## `Repeater.zip`

`Repeater.zip` takes an iterable of async iterators awaits every iteration from every iterator using `Promise.all`, and yields the resulting array.

** TODO: provide a useful example **

## `Repeater.latest`

`Repeater.latest` takes an iterable of async iterators and returns a repeater which yields an array of the latest values from each iterator whenever any of the iterators yields a value.

** TODO: provide a useful example **
