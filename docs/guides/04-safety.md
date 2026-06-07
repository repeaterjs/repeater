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

The `positions` async generator takes an async iterator of click events and yields x/y coordinates. However, because the example code calls `pos.return` immediately, the `for await…of` loop inside the `positions` generator never runs. Consequently, `clicks.return` is never called and the event listener registered inside `listen` is never cleaned up. To make this safe, we’d have to guarantee that either every `positions` generator runs at least once, or every `listen` iterator is manually returned. That’s hard to enforce, and it’s a leaky abstraction: we have to treat `listen`-based iterators differently from async generators, which you can safely create and ignore.

Repeaters solve this problem by executing lazily. In other words, the executor passed to the `Repeater` constructor does not run until the first time `next` is called. Here’s the same `listen` function written with repeaters:

```js
function listen(target, name) {
  return new Repeater(async (push, stop) => {
    const listener = (ev) => push(ev);
    console.log("adding listener!");
    target.addEventListener(name, listener);
    await stop;
    console.log("removing listener!");
    target.removeEventListener(name, listener);
  });
}
```

If we swap in this repeater-based `listen` function for the one above, neither `target.addEventListener` nor `target.removeEventListener` are called, and the `clicks` repeater can be safely ignored.

Because repeaters execute lazily, the contract for safely consuming repeaters is simple: **if you call `next`, you must call `return`**. This happens automatically when using `for await…of` loops and is easy to enforce when calling `next` manually using `try/finally`.

## Repeaters respond to backpressure
The naive `listen` function has a subtler problem: it pushes events onto an unbounded array. Suppose you use it to listen for scroll events. If those events arrive faster than the consumer pulls them, the `events` array grows without bound and performance eventually degrades. This is the “fast producer, slow consumer” problem — minor for a short-lived browser session, but crucial to handle in long-running Node.js server processes.

Inspired by Clojure’s `core.async` library, repeaters provide three solutions for dealing with slow consumers:

### 1. Waiting for pushes to resolve
The `push` function passed to the executor returns a promise which resolves when `next` is called, so that you can write code as follows:

```js
const numbers = new Repeater(async (push, stop) => {
  console.log("starting...");
  for (let i = 1; i <= 4; i++) {
    console.log(`pushing ${i}`);
    await push(i);
  }

  console.log("stopping...");
  stop();
});

(async function() {
  // starting...
  console.log(await numbers.next());
  // pushing 1
  // { value: 1, done: false }
  console.log(await numbers.next());
  // pushing 2
  // { value: 2, done: false }
  console.log(await numbers.next());
  // pushing 3
  // { value: 3, done: false }
  console.log(await numbers.next());
  // pushing 4
  // { value: 4, done: false }
  // stopping...
  console.log(await numbers.next());
  // { done: true }
})();
```

By awaiting `push`, code in the executor can wait for values to be consumed and the repeater becomes a simple synchronization mechanism between producers and consumers.

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

If you neither wish to await `push` calls nor want to deal with errors, one last option is to have the repeater store values in a buffer and drop them when the buffer reaches capacity. The `Repeater` constructor optionally takes a `RepeaterBuffer` instance as its second argument. For example, by passing in a `SlidingBuffer` instance, we can make it so that the repeater only retains the twenty latest scroll positions. If values are pulled at a slower rate than they are pushed, older values in the buffer are simply dropped.

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

The `@repeaterjs/repeater` module exports three buffer classes: `FixedBuffer`, `DroppingBuffer` and `SlidingBuffer`. `FixedBuffer` allows repeaters to push a set number of values without pushes waiting or throwing errors, but preserves the waiting/error throwing behavior described above when the buffer is full. Alternatively, `DroppingBuffer` drops the *latest* values when the buffer is full and `SlidingBuffer` drops the *earliest* values. Because `DroppingBuffer` and `SlidingBuffer` instances never fill up, pushes to repeaters with these buffers never throw overflow errors, and the promises returned from `push` always resolve immediately. You can define custom buffer classes to give repeaters more complex buffering behaviors.

## Disposing repeaters

Repeaters implement the [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) protocol, so `using` and `await using` can clean them up for you. When a repeater declared with `await using` goes out of scope, its `return` method is called automatically, which runs the executor’s cleanup and stops the repeater.

```js
import { Repeater } from "@repeaterjs/repeater";

async function untilFirstClick() {
  await using clicks = new Repeater(async (push, stop) => {
    const listener = () => push("click");
    window.addEventListener("click", listener);
    await stop;
    window.removeEventListener("click", listener);
  });

  for await (const click of clicks) {
    return click; // `await using` calls clicks.return() on the way out
  }
}
```

`Repeater` defines both `[Symbol.asyncDispose]` (which awaits `return`) and `[Symbol.dispose]` (which calls `return` synchronously), so it works with `await using` and `using` respectively. On runtimes that don’t yet support these symbols, the handlers are simply absent and repeaters behave exactly as before — you call `return` yourself.
