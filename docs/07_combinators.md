---
id: combinators 
title: Combining Async Iterators
---

Combining async iterators is a [non-trivial task](https://stackoverflow.com/questions/50585456/how-can-i-interleave-merge-async-iterables), and the `Repeater` class defines four static methods similar to `Promise.race` and `Promise.all` which allow you to combine async iterators in different ways. These methods can be used to write applications in the [reactive programming](https://en.wikipedia.org/wiki/Reactive_programming) paradigm.

## `Repeater.race`

`Repeater.race` takes an iterable of async iterables and races results from each iterable using `Promise.race`, yielding the value which fulfilled first. One important use-case is using `Promise.race` with `timeout` to place a fixed upper bound on how long each iteration of an async iterator can take:

```js
import { Repeater } from "@repeaterjs/repeater";
import { timeout } from "@repeaterjs/timers";

const numbers = new Repeater(async (push) => {
  await push(1);
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await push(3);
});

(async () => {
  try {
    for await (const num of Repeater.race([numbers, timeout(1000)])) {
      console.log(num); // 1, 2
    }
  } catch (err) {
    console.log(err); // TimeoutError: 1000 ms elapsed
  }
})();
```

The `timeout` function is a useful repeater-based utility which errors if `next` is not called within a specified period of time. In the above example, each iteration of `numbers` has one second to fulfill before the returned iterator throws.

You can also pass a promise to `Repeater.race`, in which case the entire iteration will be raced against the promise:

```js
import { Repeater } from "@repeaterjs/repeater";
import { timeout } from "@repeaterjs/timers";

const numbers = new Repeater(async (push) => {
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(1);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await push(3);
});

const timer = timeout(2000);

(async function() {
  try {
    for await (const num of Repeater.race([numbers, timer.next()])) {
      console.log(num); // 1, 2
    }
  } catch (err) {
    console.log(err); // TimeoutError: 2000 ms elapsed
  } finally {
    await timer.return();
  }
})();
```

*Note: it is important to call `timer.return` manually in a `finally` block to make sure the timer is cleaned up.*

## `Repeater.merge`

`Repeater.merge` takes an iterable of async iterables and returns a repeater which yields values whenever any of the iterables yield values. This method is useful for when you have multiple async iterators and want to consume values from all of them in the order in which they occur.

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

(async function() {
  for await (const click of Repeater.merge([leftClicks, rightClicks])) {
    console.log(click); // left, left, right, left, right
  }
})();
```

## `Repeater.zip`

`Repeater.zip` takes an iterable of async iterables, awaits a result from every iterable using `Promise.all`, and yields the resulting array. This method is useful for when you want to synchronize multiple iterators, making sure that values are pulled from each iterator in lockstep motion. For instance, you can use `Repeater.zip` with the `delay` function from the `@repeaterjs/timers` package to throttle a buffered repeater.

```js
import { Repeater, SlidingBuffer } from "@repeaterjs/repeater";
import { delay } from "@repeaterjs/timers";
const keys = new Repeater(async (push, stop) => {
  const listener = (ev) => push(ev.key);
  window.addEventListener("keydown", listener);
  await stop;
  window.removeEventListener("keydown", listener);
}, new SlidingBuffer(1));
(async function() {
  for await (const [key] of Repeater.zip([keys, delay(1000)])) {
    console.log(key); // will log the latest key every second
  }
})();
```

## `Repeater.latest`

`Repeater.latest` takes an iterable of async iterables and returns a repeater which yields an array of the latest values from each iterable whenever any of them yields a value. This method is similar to merge, except that it allows you to compare values from each iterator against each other. The first call to `next` on this repeater will not fulfill until all iterators produce a value.

```js
import { Repeater } from "@repeaterjs/repeater";
const leftCount = new Repeater(async (push, stop) => {
  let i = 0;
  push(i++);
  const listener = (ev) => push(i++);
  window.addEventListener("click", listener);
  await stop;
  window.removeEventListener("click", listener);
});
const rightCount = new Repeater(async (push, stop) => {
  let i = 0;
  push(i++);
  const listener = (ev) => push(i++);
  window.addEventListener("contextmenu", listener);
  await stop;
  window.removeEventListener("contextmenu", listener);
});
(async function() {
  for await (const [left, right] of Repeater.latest([leftCount, rightCount])) {
    if (left === right) {
      console.log("You have left- and right-clicked the exact same number of times");
    } else if (left > right) {
      console.log(`You have left-clicked ${left - right} more times than right-clicked`);
    } else {
      console.log(`You have right-clicked ${right - left} more times than left-clicked`);
    }
  }
})();
```
