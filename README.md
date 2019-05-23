# Channel.js
The missing constructor for creating safe async iterators

NOTE: This README assumes some familiarity with recent javascript features, specifically [promises](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises), [async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators).

## Installation

`npm install @channel/channel`

`yarn add @channel/channel`

## Rationale
While [async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various perceived [flaws](https://github.com/apollographql/graphql-subscriptions/issues/116) and [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126). What’s needed is something like the `Promise` constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. This library implements the `Channel` constructor, making it easy to turn *any* callback-based source of recurring data (e.g. `EventTarget`, `WebSocket`, `Stream`, `Observable`) into an async iterator. The `Channel` constructor drops developers into a [pit of success](https://blog.codinghorror.com/falling-into-the-pit-of-success/) by preventing common async iterator mistakes [by design](#how-are-channels-safe).

## Examples

Logging a timestamp every second and stopping after ten iterations.

```js
import { Channel } from "@channel/channel";

const timestamps = new Channel(async (push, _, stop) => {
  push(Date.now());
  const timer = setInterval(() => push(Date.now()), 1000);
  await stop;
  clearInterval(timer);
});

(async function() {
  let i = 0;
  for await (const timestamp of timestamps) {
    console.log(timestamp);
    i++;
    if (i >= 10) {
      console.log("ALL DONE!");
      break; // triggers clearInterval above
    }
  }
})();
```

Logging messages from a websocket and closing if we receive the message "close".

```js
import { Channel } from "@channel/channel";

const messages = new Channel(async (push, close, stop) => {
  const socket = new WebSocket("ws://localhost:3000");
  socket.onmessage = (ev) => push(ev.data);
  socket.onerror = () => close(new Error("WebSocket error"));
  socket.onclose = () => close();
  await stop;
  socket.close();
});

(async function() {
  for await (const message of messages) {
    console.log(message);
    if (message === "close") {
      break;
    }
  }
})();
```

Listening for the [Konami Code](https://en.wikipedia.org/wiki/Konami_Code) and canceling if <kbd>Escape</kbd> is pressed.

```js
import { Channel } from "@channel/channel";

const keys = new Channel(async (push, close, stop) => {
  const listener = (ev) => {
    if (ev.key === "Escape") {
      close();
    } else {
      push(ev.key);
    }
  };
  window.addEventListener("keyup", listener);
  await stop;
  window.removeEventListener("keyup", listener);
});

const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

(async function() {
  let i = 0;
  for await (const key of keys) {
    if (key === konami[i]) {
      i++;
    } else {
      i = 0;
    }
    if (i >= konami.length) {
      console.log("KONAMI!!!");
      break; // closes the channel and removes the keyup listener
    }
  }
})();
```

## Overview

Channels are opaque objects which implement the methods found on the [`AsyncIterableIterator` interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to the next result, and `Channel.prototype.return` closes the channel prematurely. Async iterators are most useful when consumed via [`for await…of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) loops, which call and await the channel’s `next`/`return` methods automatically, as seen in the examples above. A function which returns a channel is virtually indistinguishable from an async generator.

Similar to the `Promise` constructor, the `Channel` constructor takes an *executor*, a function which is passed the arguments `push`, `close` and `stop`. The `push` and `close` arguments are functions analogous to the `Promise` executor’s `resolve` and `reject` arguments: `push` can be called with a value so that `next` resolves to that value, and `close` can be called with an error so that `next` rejects with that error. However, unlike `resolve`, `push` can be called more than once to enqueue multiple values onto the channel, and unlike `reject`, `close` can be called with no arguments to close the channel without error. The `stop` argument is unique to the `Channel` executor: it is a promise which resolves when the channel is closed. These three arguments make it easy to setup and teardown callbacks within the executor, and they can be selectively exposed to parent closures to model architectural patterns like [pubsub](packages/pubsub) and [semaphores](packages/limiters).

## How are channels “safe”?
Most async iterator libraries currently available are prone to causing memory leaks through normal usage. Channels use the following design principles to prevent leaks:

### Channels execute lazily.
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

The `listen` function returns an async iterator of events and cleans up after itself when `return` is called. However, there is no guarantee that `return` will be called in normal usage, causing a memory leak in the form of unremoved event listeners. Consider the following usage of `listen` with an async generator:

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
  const clicks = listen(window, "click"); // => adding listener!
  const pos = positions(clicks);
  // never mind we’re not interested in the positions of clicks.
  pos.return(); // 💭💭💭 clicks.return is never called.
})();
```

The `positions` async generator takes an async iterator of click events and yields x/y coordinates. However, in the example, the `pos.return` method is called immediately so that the `for await…of` loop inside the `positions` generator never starts. Consequently, `clicks.return` is never called and the event listener registered inside `listen` is never cleaned up. To make the code safe, we would have to make sure that either every `positions` generator is iterated at least once, or that every `listen` iterator is manually returned. This logic is difficult to enforce and indicative of a leaky abstraction in that we have to treat `listen`-based async iterators differently than async generator objects, the latter of which can be safely created and ignored.

Channels solve this problem by executing lazily. In other words, the executor passed to the `Channel` constructor does not run until the first time `next` is called. Here’s the same `listen` function written with channels:

```js
function listen(target, name) {
  return new Channel(async (push, _, stop) => {
    const listener = (ev) => push(ev);
    console.log("adding listener!");
    target.addEventListener(name, listener);
    await stop;
    console.log("removing listener!");
    target.removeEventListener(name, listener);
  });
}
```

If we swap in the channel-based `listen` function for the one above, neither `target.addEventListener` nor `target.removeEventListener` are called, and the `clicks` channel can be safely garbage collected.

Because channels execute lazily, the contract for safely consuming channels is simple: **if you call `next`, you must call `return`**. This happens automatically when using `for await…of` loops and is easy to enforce when calling `next` manually using control-flow syntax like `try/finally`.

### Channels respond to backpressure.
The naive `listen` function has an additional, potentially more insidious problem, which is that it pushes events onto an unbounded array. For instance, one can imagine creating an async iterator which listens for scroll events, where the rate at which events are created outpaces the rate at which iterator iterates, perhaps because of a bottleneck or hanging promise. In this situation, the `events` array created by the naive `listen` function would continue to grow as the user scrolled, eventually causing application performance to degrade. This is often referred to as the “fast producer, slow consumer” problem and while it might not seem like a big issue for short-lived browser sessions, it is crucial to deal with when writing long-running server processes with Node.js.

Inspired by Clojure’s `core.async` library, channels provide three solutions for dealing with slow consumers:

#### 1. Waiting for pushes to resolve.
The `push` function passed to the executor returns a promise which resolves when `next` is called, so that you can write code as follows:

```js
const numbers = new Channel(async (push, close) => {
  for (let i = 0; i <= 100; i++) {
    await push(i);
  }
  close();
});

(async function() {
  console.log(await numbers.next()); // => { value: 0, done: false }
  let result = [];
  for await (number of numbers) {
    result.push(number);
  }
  console.log(result); // => [1, 2, 3, ..., 99, 100]
})();
```

By awaiting `push`, code in the executor can wait for values to be pulled and the channel becomes a simple synchronization mechanism between producers and consumers.

#### 2. Throwing errors.

When using callback-based APIs, it is often inconvenient to await `push` calls because the callbacks run frequently and synchronously. Therefore, channels allow you to call `push` in a fire-and-forget manner with the caveat that `push` will begin throwing synchronous errors when there are too many pending pushes.

```js
const ys = new Channel(async (push, _, stop) => {
  const listener = () => push(window.scrollY); // ⚠️ Will eventually throw a ChannelOverflowError!!!
  window.addEventListener("scroll", listener);
  await stop;
  window.removeEventListener("scroll", listener);
});

ys.next();
```

This behavior is desirable because it allows developers to quickly surface bottlenecks and hanging promises when and where they happen, rather than when the process runs out of memory.

#### 3. Buffering and dropping values

If you neither wish to await `push` calls nor want to deal with errors, one last option is to have the channel store values in a buffer and drop them when the buffer reaches capacity. The `Channel` constructor optionally takes a `ChannelBuffer` instance as its second argument. For example, by passing in a `SlidingBuffer` instance, we can make it so that the channel only retains the twenty latest scroll positions.

```js
import { Channel, SlidingBuffer } from "@channel/channel";

const ys = new Channel(async (push, _, stop) => {
  const listener = () => push(window.scrollY); // 🙂 will never throw
  window.addEventListener("scroll", listener);
  await stop;
  window.removeEventListener("scroll", listener);
}, new SlidingBuffer(20));

ys.next();
```

The `@channel/channel` package exports three `ChannelBuffer` classes: `FixedBuffer`, `DroppingBuffer` and `SlidingBuffer`. `FixedBuffer` allows channels to push a set number of values without waiting, but preserves the waiting/error throwing behavior described above when the buffer is full. Alternatively, `DroppingBuffer` will drop the *latest* values when the buffer is full and `SlidingBuffer` will drop the *earliest* values. Because `DroppingBuffer` and `SlidingBuffer` instances never fill up, pushes to channels with these buffers never throw. You can define custom buffer classes to give channels more complex buffering behaviors.

## Dealing with rejection

**TODO**

## Common anti-patterns

**TODO**

## Additional packages

In addition to the `@channel/channel` package, this repository also contains various async utility packages implemented with channels.

- `@channel/timers` - Cancelable timers
- `@channel/pubsub` - A generic pubsub class
- `@channel/limiters` - Async iterator functions for limiting concurrency

These packages are experimental and will probably be changed more frequently than the base `@channel/channel` package, which is more or less stable. If you need greater stability, I encourage you to copy the code from these packages directly into your codebase. Report back on what works and what doesn’t! My hope is that this repository and the `@channel` scope becomes a place for useful, channel-based async utilities discovered by the community.

## Acknowledgments

Thanks to Clojure’s `core.async` for inspiration. Specifically, the implementation of channels is more or less based on [this video](https://vimeo.com/100518968) explaining `core.async` internals.

Thanks to [this StackOverflow answer](https://stackoverflow.com/a/47214496/1825413) for providing a helpful overview of the different types of async APIs available in javascript.
