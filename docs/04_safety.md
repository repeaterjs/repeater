---
id: safety
title: How are Repeaters “Safe”?
---

Most async iterator libraries currently available are prone to causing memory leaks through normal usage. Repeaters use the following design principles to prevent them:

## Repeaters execute lazily
There are several existing async iterator libraries which provide tightly-coupled wrappers around event emitters, streams, or other callback-based APIs. Almost all of them make the critical mistake of registering callbacks eagerly, i.e. when the iterator is created. Consider the following naive async iterator returning function:

```js
function listen(target, name) {
  const events = [];
  const nexts = [];
  function listener(ev) {
    const next = nexts.shift();
    if (next == null) {
      events.push(ev);
    } else {
      next({ value: ev, done: false });
    }
  };
  console.log("adding listener!");
  target.addEventListener(name, listener);
  return {
    next() {
      const ev = events.shift();
      if (ev == null) {
        return new Promise((next) => nexts.push(next));
      }
      return Promise.resolve({ value: ev, done: false });
    },
    return() {
      nexts.forEach((next) => next({ done: true }));
      console.log("removing listener!");
      target.removeEventListener(name, listener);
      return Promise.resolve({ done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
```

The `listen` function returns an async iterator of events and cleans up after itself when `return` is called. However, there is no guarantee that `return` will be called in normal usage, causing a memory leak in the form of unremoved event listeners. Consider the following usage of `listen` above with an async generator:

```js
async function* positions(clicks) {
  for await (const c of clicks) {
    yield {
      x: c.clientX,
      y: c.clientY,
    };
  }
}

(async function() {
  const clicks = listen(window, "click"); // adding listener!
  const pos = positions(clicks);
  // never mind we’re not interested in the positions of clicks.
  pos.return(); // 💭💭💭 clicks.return is never called.
})();
```

The `positions` async generator takes an async iterator of click events and yields x/y coordinates. However, because in the example `pos.return` is called immediately, the `for await…of` loop inside the `positions` generator never starts. Consequently, `clicks.return` is never called and the event listener registered inside `listen` is never cleaned up. To make the code safe, we would have to make sure that either every `positions` generator is iterated at least once, or that every `listen` iterator is manually returned. This logic is difficult to enforce and indicative of a leaky abstraction in that we have to treat `listen`-based async iterators differently than async generator objects, the latter of which can be safely created and ignored.

Repeaters solve this problem by executing lazily. In other words, the executor passed to the `Repeater` constructor does not run until the first time `next` is called. Here’s the same `listen` function written with repeaters:

```js
function listen(target, name) {
  return new Repeater(async (push, _, stop) => {
    const listener = (ev) => push(ev);
    console.log("adding listener!");
    target.addEventListener(name, listener);
    await stop;
    console.log("removing listener!");
    target.removeEventListener(name, listener);
  });
}
```

If we swap in the repeater-based `listen` function for the one above, neither `target.addEventListener` nor `target.removeEventListener` are called, and the `clicks` repeater can be safely garbage collected.

Because repeaters execute lazily, the contract for safely consuming repeaters is simple: **if you call `next`, you must call `return`**. This happens automatically when using `for await…of` loops and is easily enforce when calling `next` manually using `try/finally`.

## Repeaters respond to backpressure
The naive `listen` function has an additional, potentially more insidious problem, which is that it pushes events onto an unbounded array. For instance, one can imagine creating an async iterator which listens for scroll events, where the rate at which events are created outpaces the rate at which values are pulled from the iterator, perhaps because of a bottleneck or hanging promise. In this situation, the `events` array created by the naive `listen` function would continue to grow as the user scrolled, eventually causing application performance to degrade. This is often referred to as the “fast producer, slow consumer” problem and while it might not seem like a big issue for short-lived browser sessions, it is crucial to deal with when writing long-running server processes with Node.js.

Inspired by Clojure’s `core.async` library, repeaters provide three solutions for dealing with slow consumers:

### 1. Waiting for pushes to resolve
The `push` function passed to the executor returns a promise which resolves when `next` is called, so that you can write code as follows:

```js
const numbers = new Repeater(async (push, stop) => {
  for (let i = 0; i <= 100; i++) {
    await push(i);
  }
  stop();
});

(async function() {
  console.log(await numbers.next()); // { value: 0, done: false }
  let result = [];
  for await (number of numbers) {
    result.push(number);
  }
  console.log(result); // [1, 2, 3, ..., 99, 100]
})();
```

By awaiting `push`, code in the executor can wait for values to be pulled and the repeater becomes a simple synchronization mechanism between producers and consumers.

### 2. Throwing errors

When using callback-based APIs, it is often inconvenient to await `push` calls because the callbacks run frequently and synchronously. Therefore, repeaters allow you to call `push` in a fire-and-forget manner with the caveat that `push` will begin throwing synchronous errors when there are too many pending pushes.

```js
const ys = new Repeater(async (push, stop) => {
  const listener = () => push(window.scrollY); // ⚠️ Might throw an error!
  window.addEventListener("scroll", listener);
  await stop;
  window.removeEventListener("scroll", listener);
});

ys.next();
```

This behavior is desirable because it allows developers to quickly surface bottlenecks and deadlocks when and where they happen, rather than when the process runs out of memory.

### 3. Buffering and dropping values

If you neither wish to await `push` calls nor want to deal with errors, one last option is to have the repeater store values in a buffer and drop them when the buffer reaches capacity. The `Repeater` constructor optionally takes a `RepeaterBuffer` instance as its second argument. For example, by passing in a `SlidingBuffer` instance, we can make it so that the repeater only retains the twenty latest scroll positions.

```js
import { Repeater, SlidingBuffer } from "@repeaterjs/repeater";

const ys = new Repeater(async (push, stop) => {
  const listener = () => push(window.scrollY); // 🙂 will never throw
  window.addEventListener("scroll", listener);
  await stop;
  window.removeEventListener("scroll", listener);
}, new SlidingBuffer(20));

ys.next();
```

The `@repeaterjs/repeater` package exports three buffer classes: `FixedBuffer`, `DroppingBuffer` and `SlidingBuffer`. `FixedBuffer` allows repeaters to push a set number of values without pushes waiting or throwing an error, but preserves the waiting/error throwing behavior described above when the buffer is full. Alternatively, `DroppingBuffer` will drop the *latest* values when the buffer is full and `SlidingBuffer` will drop the *earliest* values. Because `DroppingBuffer` and `SlidingBuffer` instances never fill, pushes to repeaters with these buffers never throw, and the returned promise will resolve immediately. You can define custom buffer classes to give repeaters more complex buffering behaviors.

