# Channel.js
## The missing constructor function for safe async iterators.

NOTE: This README assumes familiarity with [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), [async/await](https://javascript.info/async-await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators) in javascript.

[Async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes but have yet to achieve widespread usage by the community due to various [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126) and [gotchas](https://github.com/apollographql/graphql-subscriptions/issues/116). This library implements the `Channel` class, a minimal message queue which emulates the simplicity of the `Promise` constructor and makes it easy to transform *any* callback-based sources (e.g. `EventTargets`, `EventEmitters`, node.js `Streams`, `WebSockets`, `Observables`) into async iterators. The `Channel` class is designed to drop developers into a [pit of success](https://blog.codinghorror.com/falling-into-the-pit-of-success/) by preventing common mistakes developers make when hand-crafting async iterators.

## Usage

The following example listens for the [Konami Code](https://en.wikipedia.org/wiki/Konami_Code) via keypresses and cancels if <kbd>Escape</kbd> is pressed.

```js
const keys = new Channel(async (push, close, stop) => {
  function listener(ev) {
    const key = ev.key;
    if (key === "Escape") {
      close();
    } else {
      push(key);
    }
  }
  document.addEventListener("keyup", listener);
  await stop;
  document.removeEventListener("keyup", listener);
});

const konami = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

(async () {
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

Like [async generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*), channels are opaque objects which can only be read or closed via the methods found on the [`AsyncIterableIterator` interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to an iteration result, and `Channel.prototype.return` closes the channel prematurely. [`for await…of` loops](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) are a convenient way to call the channel’s `next` and `return` methods automatically, as seen above.


Similar to the [`Promise` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), the `Channel` constructor takes an *executor*, a function which is passed the arguments `push`, `close` and `stop`. The `push` and `close` arguments are functions analogous to the `Promise` constructor’s `resolve` and `reject` functions. You can call `push` with a value so that `next` resolves to that value, and you can call `close` with an error so that `next` rejects with that error. However, unlike `resolve`, `push` can be called more than once to enqueue multiple values on the channel, and unlike `reject`, `close` can be called with no arguments to close the channel without erroring. The `stop` argument is unique to the `Channel` executor: it is a promise which resolves when the channel is closed. These three arguments are enough to allow convenient setup and teardown of callbacks within the executor, and can be selectively exposed to parent closures to model complex async architectural patterns like [pubsub](packages/pubsub/index.ts) and [semaphores](packages/limiters/index.ts).

## Why are channels “safe”?
Most async iterator libraries currently available make at least one of three mistakes which make them unsuitable for large, complex codebases and long-lived processes. Channels use the following design principles to avoid them:

### Strict separation of producers and consumers.
Many async iterator libraries expose methods directly on iterator objects to allow consumers to pass values or errors back and forth. This is similar to the now obsolete [`Promise.defer`](https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Deferred) in that the practice is likely an anti-pattern because it means that iterators cannot be passed freely between several consumers (as would happen in a `Promise.all` call) without worrying about consumers affecting each other in unexpected ways.

By contrast, channels use the executor pattern to enforce the one-way communication of values and errors between producers and consumers. Code within the executor has no access to the returned channel, and the returned channel cannot be made to push new values or throw errors.

### Lazy execution
There are several async iterator libraries which provide tightly-coupled wrappers around event emitters, streams, or other callback-based APIs. Most of these libraries make the critical mistake of registering callbacks eagerly, i.e. when the iterator is created. Consider the following naive async iterator returning function:

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
      console.log("removing listener!");
      target.removeEventListener(name, listener);
    }
  };
}
```

`listen` returns an async iterator which is sent events from a specific event target/name and cleans up after itself when `return` is called. However, normal usage of this iterator may result in `return` never being called, causing a memory leak in the form on unremoved event listeners. Consider the following usage of `listen` above with an async generator:

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
  const clicks1 = listen(node, "click"); // => adding listener!
  const pos1 = positions(clicks);
  await pos1.next(); // => { done: false, result: { x: 100, y: 100 } }
  pos1.return(); // => removing listener!
  const clicks2 = listen(node, "click"); // => adding listener!
  const pos2 = positions(clicks);
  // never mind we’re not interested in the positions of clicks.
  pos2.return(); // 💭💭💭 clicks2.return is never called.
})();
```

The `positions` generator is meant to iterate over click events and transform them into x/y coordinates, but in this example, the second `positions` generator `pos2` is returned before the code inside it is ever run. This means that the `for await…of` loop inside `positions`, which would normally call `clicks2.return` upon completion, is never called. To make the code above safe, a developer would have to check that all `positions` generators call `next` at least once, and manually call the `return` method of `listen` generators if the iterators are never started. Such code is difficult to write and ultimately requires treating the return value of `listen` differently than the return values of async generators, which can be safely created and ignored.

The `Channel` class solves this problem by calling executors lazily. In other words, executors do not run until the first time `next` is called. Here’s the same `listen` function above written with channels:

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

If we swap in this `listen` function for the naive one above, `target.addEventListener` is only called when the `positions` generators are started, `target.removeEventListener` is called automatically when the generators are returned, and the `clicks2` channel can be safely garbage collected because its executor never runs in the first place.

Because channels execute lazily, the contract for safely consuming channels is relatively simple: **if you call `next`, you must call `return`**. This happens automatically when using `for await…of loops` and is easy to enforce when calling `next` manually using control-flow syntax like `try/finally`.

### Backpressure-aware

The naive `listen` function above has an additional, potentially more insidious problem, which is that it pushes events onto an unbounded array. One can imagine creating a `clicks` iterator and then ignoring the values while doing some other asynchronous tasks. As the user continues clicking, the `events` array will continue to grow without any guarantee that the iterator will pull values at the same rate. This is often referred to as the “fast producer, slow consumer“ problem, and while it might not seem like a big issue for short-lived browser sessions, it is crucial to deal with when writing long-running server processes with javascript.

Inspired by Clojure’s `core.async` library, channels provide three solutions for dealing with slow consumers.

#### 1. Waiting for pushes to resolve.
The `push` function passed to the channel executor returns a promise which resolves when `next` is called, so that you can write code like:

```js
const numbers = new Channel(async (push, close) => {
  for let (i = 0; i <= 100; i++) {
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

The returned promise allows code in executors to wait for slow consumers using `await` and serves as a simple synchronization mechanism between producers and consumers.

#### Throwing errors.

When using callback-based APIs, it is often not convenient to await `push` calls because the callbacks are run frequently and synchronously. Therefore, rather than letting queues grow in an unbounded fashion, `push` calls will begin throwing errors when there are too many pending pushes. For example:

```js
const scrollPositions = new Channel(async (push, _, stop) => {
  const handler = () => {
    push(window.scrollY); // eventually this will throw a `ChannelOverflowError`
  };
  window.addEventListener("scroll", handler);
  await stop;
  window.removeEventListener("scroll", handler);
});
```

This behavior is desirable because it allows developers to quickly surface bottlenecks and hanging promises as they happen, rather than when the process runs out of memory.

#### Dropping values

If you can neither await `push` calls nor are willing to have them throw errors, one last option is to have the channel store values in a buffer and drop values when the buffer is full. To facilitate this, the channel constructor can optionally take a custom `ChannelBuffer` instance as a second argument. The following code makes use of a `SlidingBuffer` to drop messages from a websocket connection:

```js
import { Channel, SlidingBuffer } from "@channel/channel";

const messages = new Channel(async (push, _, stop) => {
  const socket = new WebSocket("ws://localhost:3000");
  socket.onmessage((m) => push(m));
  await stop;
  socket.close();
}, SlidingBuffer(20));
```

In the above code, the oldest messages from the websocket are dropped when there are more than twenty outstanding messages. The `@channel/channel` package comes with three buffer classes: `FixedBuffer`, which causes pending pushes only when the buffer is full; `DroppingBuffer`, which drops the *newest* values when the buffer is full; and `SlidingBuffer`, which drops the *oldest* values when the buffer is full. Because `DroppingBuffer` and `SlidingBuffer` drop values, using them means that calls to `push` will never throw. You can define your own buffer classes to give channels more complex value-dropping behaviors.

## Available packages

In addition to the `@channel/channel` packages which exports 

Further reading:
