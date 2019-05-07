# Channel.js
The missing constructor for creating safe async iterators

NOTE: This README assumes some familiarity with recent javascript features, specifically [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), [async/await](https://javascript.info/async-await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators).

## Installation
`npm install @channel/channel`

`yarn add @channel/channel`

## Rationale
While [async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various [perceived flaws](https://github.com/tc39/proposal-async-iteration/issues/126) and [pitfalls](https://github.com/apollographql/graphql-subscriptions/issues/143). What’s needed is something like the `Promise` constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. Emulating the `Promise` constructor, this library implements a `Channel` constructor and makes it easy to turn *any* callback-based source of data (e.g. `EventTarget`, `WebSocket`, `Stream`, `Observable`) into an async iterator. Channels are carefully designed to drop developers into a [pit of success](https://blog.codinghorror.com/falling-into-the-pit-of-success/) by [preventing common async iterator mistakes from ever being made](#how-are-channels-safe).

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

Creating a channel from a websocket.

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

// log messages and close if we receive the message "close"
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

Channels are opaque objects which implement the methods found on the [`AsyncIterableIterator` interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to the next result, and `Channel.prototype.return` closes the channel prematurely. Async iterators are most useful when consumed via [`for await…of` loops](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) which call and await the channel’s `next`/`return` methods automatically, as seen in the examples above. Channels can be used as drop-in replacements for async generator objects.

Similar to the `Promise` constructor, the `Channel` constructor takes an *executor*, a function which is passed the arguments `push`, `close` and `stop`. The `push` and `close` arguments are functions analogous to the `Promise` executor’s `resolve` and `reject` arguments: `push` can be called with a value so that `next` resolves with that value, and `close` can be called with an error so that `next` rejects with that error. However, unlike `resolve`, `push` can be called more than once to enqueue multiple values onto the channel, and unlike `reject`, `close` can be called with no arguments to close the channel without error. The `stop` argument is unique to the `Channel` executor: it is a promise which resolves when the channel is closed. These three arguments allow for convenient setup and teardown of callbacks within the executor, and they can be selectively exposed to parent closures to model architectural patterns like [pubsub](packages/pubsub) and [semaphores](packages/limiters).

## How are channels “safe”?
Most async iterator libraries currently available cause memory leaks during normal usage. Channels use the following design principles to prevent them:

### Channels execute lazily.
There are several existing async iterator libraries which provide tightly-coupled wrappers around event emitters, streams, or other callback-based APIs. Almost all of them make the critical mistake of registering callbacks eagerly, i.e. when the iterator is created. Consider the following naive async-iterator-returning function:

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

The `listen` function above yields an iterator of events and cleans up after itself when `return` is called. However, typical usage of such an iterator may result in `return` never being called, causing a memory leak in the form of unremoved event handlers. Consider the following usage of `listen` with an async generator:

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

The `positions` async generator takes an async iterator of click events and yields x/y coordinates. However, in the example, the generator returns early so that the `for await…of` loop never starts. Consequently, `clicks.return` is never called and the event handler is never cleaned up. To make the code above safe, a developer would have to make sure that either every `positions` generator is started or that every `listen` iterator is manually returned. This logic is difficult to enforce and indicates an abstraction leak in that it forces developers to treat the async iterators returned from `listen` differently than async generator objects, the latter of which can be safely created and ignored.

Channels solve this problem by executing lazily. In other words, the executor passed to the `Channel` constructor does not run until the first time `next` is called. Here’s the same `listen` function above written with channels:

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

Because channels execute lazily, the contract for safely consuming channels is relatively simple: **if you call `next`, you must call `return`**. This happens automatically when using `for await…of` loops and is easy to enforce when calling `next` manually using control-flow syntax like `try/finally`.

### Channels respond to backpressure.
The naive `listen` function has an additional, potentially more insidious problem, which is that it pushes events onto an unbounded array. For instance, one can imagine creating a scroll-listening async iterator where the scroll handler rapidly pushes values to the `events` array even though values are being pulled slowly or not at all. As the user scrolled, the array would continue to grow, eventually causing application performance to degrade. This is often referred to as the “fast producer, slow consumer“ problem, and while it might not seem like a big issue for short-lived browser sessions, it is crucial to deal with when writing long-running server processes with node.js.

Inspired by Clojure’s `core.async`, channels provide three solutions for dealing with slow consumers.

#### 1. Waiting for pushes to resolve.
The `push` function passed to the channel executor returns a promise which resolves when `next` is called, so that you can write code as follows:

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

By awaiting `push`, channel consumers can wait for values to be pulled and the channel becomes a simple synchronization mechanism between producers and consumers.

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

If you neither wish to await `push` calls nor want to deal with errors, one last option is to have the channel store values in a buffer and drop them when the buffer has reached capacity. The channel constructor optionally takes a `ChannelBuffer` instance as its second argument. For example, by passing in a `SlidingBuffer`, we can make it so that the channel above only retains the twenty latest scroll positions.

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

The `@channel/channel` package exports three `ChannelBuffer` classes: `FixedBuffer`, `DroppingBuffer` and `SlidingBuffer`. `FixedBuffer` allows channels to push a set number of values without having pushes wait, but preserves the error throwing behavior described above when the buffer is full. Alternatively, `DroppingBuffer` will drop the *latest* values when the buffer has reached capacity and `SlidingBuffer` will drop the *earliest* values. Because `DroppingBuffer` and `SlidingBuffer` instances never fill up, pushing to channels with these types of buffers will never throw errors. You can define custom buffer classes to give channels more complex buffering behaviors.

## Dealing with errors and promise rejections

**TODO**

## Common anti-patterns

**TODO**

## Additional packages

In addition to the `@channel/channel` package which exports the `Channel` and `ChannelBuffer` classes, this repository also contains various async utility packages implemented with channels.

- `@channel/timers` - Cancelable timers
- `@channel/pubsub` - A generic pubsub class
- `@channel/limiters` - Async iterator functions for limiting concurrency

These packages are experimental and will probably be changed more frequently than the base `@channel/channel` package, which is more or less stable. If you need greater stability, I encourage you to copy the code directly into your codebase. Report back on what works and what doesn’t! My hope is that this repository and the `@channel` npm scope becomes a place for useful, channel-based async utilities discovered by the community.

## Acknowledgments

Thanks to Clojure’s `core.async` for inspiration. Specifically, [this video](https://vimeo.com/100518968) explaining `core.async` internals was helpful when implementing channels and the semantics of its methods.

Thanks to [this StackOverflow answer](https://stackoverflow.com/a/47214496/1825413) for providing a helpful overview of the different types of async APIs available in javascript.
