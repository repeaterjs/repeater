# Channel.js

### The missing constructor function for creating safe async iterators.

[Async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern js runtimes but have yet to see widespread usage by the community due to various [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126) and [gotchas](https://github.com/apollographql/graphql-subscriptions/issues/116). This library implements `Channel`, a minimal message queue class which emulates the simplicity of the `Promise` constructor and makes it easy to turn *any* callback-based source of async data (e.g. `EventTarget`, `EventEmitter`, `Stream`, `WebSocket`, `Observable`) into an async iterator. The `Channel` class is designed to lead developers into a [pit of success](https://blog.codinghorror.com/falling-into-the-pit-of-success/) when creating and using async iterators by forcing developers to avoid the most common mistakes and anti-patterns.

## Usage

```js
import { Channel } from "@channel/channel";

// returns an async iterator which yields an incrementing number every second, stopping at 5
const numbers = new Channel(async (push, close, stop) => {
  let i = 0;
  const timer = setInterval(() => {
    push(i++);
    if (i > 5) {
      close();
    }
  }, 1000);
  await stop;
  clearInterval(timer);
});

(async function() {
  console.log(await numbers.next()); // => { value: 0, done: false }
  let result = [];
  for await (number of numbers) {
    result.push(number);
  }
  console.log(result); // => [1, 2, 3, 4, 5]
})();
```

Like [async generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*), channels are opaque objects which can only be read or closed via the methods found on the [`AsyncIterableIterator` interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to the next result of the iteration, and `Channel.prototype.return` closes the channel. Using [`for await…of` loops](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) is a convenient way to call the channel’s `next` and `return` methods automatically.

Like the [`Promise` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), the `Channel` constructor takes an *executor*: a function which is passed three arguments: `push`, `close` and `stop`. The `push` and `close` arguments are functions analogous to the `resolve` and `reject` functions passed to `Promise` executors: you can call `push` with a value so that `next` calls resolves to that value, and you can call `close` with an error so that `next` calls reject with that error. However, unlike `resolve`, `push` can be called more than once to enqueue multiple values on the channel, and unlike `reject`, `close` can be called with no arguments to close the channel without error. The `stop` argument is unique to the `Channel` executor: it is a promise which is resolved when the channel is closed. These three arguments allow convenient setup and teardown of callbacks within the executor, and can be selectively exposed to parent closures to model complex architectural patterns like [pubsub]() and [semaphores]().

## Examples

### Listening to events
```js
// TODO
```

### Cancelable timers
```js
// TODO
```

### Pubsub
```js
// TODO
```


## How are channels “safe”?
Most async iterator libraries currently available make at least one of three common mistakes, which make them unsuitable for large, complex codebases and long-lived node.js processes. Channels use the following design principles to avoid them.

### One-way communication
Many async iterator libraries expose methods analogous to `push` and `close` directly on the iterator to allow consumers to pass values back and forth. This is analogous to the now obsolete [`Deferred objects`](https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Deferred) for creating promises and is an anti-pattern because it prevents iterators from being passed freely between multiple consumers (as in a `Promise.all` call) without worry that the consumers will affect each other in unexpected ways.

By contrast, channels use the executor pattern to enforce strict separation between channel producers and channel consumers. Code within the executor has no access to the returned channel, and the returned channel has no access to `push` or `close`.

### Lazy initialization
There are several async iterator libraries which provide tightly-coupled wrappers around event emitters, streams, or other callback-based APIs. Most of these libraries make the critical mistake of registering callbacks eagerly, i.e. when the iterator is created. Consider the following naive function:

```js
function listen(target, name) {
  const events = [];
  const nexts = [];
  const listener = (ev) => {
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

`listen` returns an async iterator which listens for events on a specific target and cleans up after itself on `return`; however, normal usage of the returned iterator may result in `return` and therefore `target.removeEventListener` never being called! Consider the following example usage of `listen` with a simple async generator:

```js
const clicks = listen(node, "click"); // => adding listener!
async function* positions(clicks) {
  for await (const c of clicks) {
    yield {
      x: c.clientX,
      y: c.clientY,
    };
  }
}
// never mind we’re not interested in the positions of clicks.
positions(clicks).return(); // => 💭
// event listener is never removed
```

The `position` async generator is meant to iterate over click events and transform them into x/y coordinates, but the generator is returned before any code inside it is even run. This means that the `for await…of` loop inside `positions`, which would normally call `clicks.return` for you, is never called. This will cause an unremoved event handlers, a common memory leak. To make the code above safe, a developer would have to manually check that any `positions` generators are iterated through at least once, and calling `clicks.return` manually otherwise. Such code is prone to errors and requires treating `listen` differently than an async generator, which can be safely created and ignored.

The `Channel` class solves this problem by calling executors lazily. In other words, executors do not run until the first time `next` is called.

Here’s the listen function above using a channel:
```js
function listen(target, name) {
  return new Channel(async (push, _, stop) => {
    const listener = (ev) => push(ev);
    console.log("adding listener");
    target.addEventListener(name, listener);
    await stop;
    console.log("removing listener");
    target.removeEventListener(name, listener);
  });
}
```

If we swap in this listen function for the one above, `target.addEventListener` will never be called, and the channel can be safely garbage collected without anyone knowing it ever dreamed of listening for click events.

Because channels execute lazily, the contract for safely consuming channels is relatively simple: if you call `next`, you must call `return`. This is handled automatically when using `for await…of loops` and is easy to enforce when calling `next` manually using control-flow syntax like `try/finally`.

### Backpressure-aware

The naive `listen` function above had an additional, potentially more insidious problem, which is that it pushes click events onto an unbounded array. One can imagine creating the `clicks` iterator and then ignoring the values while doing some other asynchronous tasks. As the user continues clicking, the number of clicks will grow without any guarantee that the iterator will pull values at the same rate. This is often referred to as the “fast producer, slow consumer“ problem. While this might not seem like such a big issue for short-lived browser sessions, the problem is exacerbated and crucial to deal with in long-running node.js processes, for instance.

Inspired by Clojure’s `core.async` library, channels provide three possible solutions for dealing with this problem.

#### Waiting for pushes to resolve.

The `push` function passed to the channel executor returns a promise which resolves when `next` is called, so you can write code as follows:

```js
const numbers = new Channel(async (push, close) => {
  for let (i = 0; i <= 200; i++) {
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
  console.log(result); // => [1, 2, 3, ...199, 200]
})();
```

The returned promise allows code in executors to wait for slow consumers using `await`, and serves as a simple synchronization mechanism for producers and consumers.

#### Throwing errors.

When using event listeners, it is often not convenient or possible to await `push` calls because the event handlers are run frequently and synchronously. Rather than letting queues grow unbounded, `push` will throw an error when there are too many pending pushes.

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

Internally, `push` will throw when there are more than 1024 outstanding calls to `push`. This behavior is desirable because it allows developers to surface bottlenecks and hanging promises early, rather than when the process runs out of memory.


#### Dropping values

If you can neither await `push` calls nor are willing to have `push` throw errors, your best option is to have the channel store values in a buffer and ignore them when the buffer is full. To facilitate this, the channel constructor can optionally take custom `ChannelBuffer` instances as a second argument.

```js
import { Channel, SlidingBuffer } from "@channel/channel";

const messages = new Channel(async (push, _, stop) => {
  const socket = new WebSocket("ws://localhost:3000");
  socket.onmessage((m) => push(m));
  await stop;
  socket.close();
}, SlidingBuffer(20));
```

In the above code, the oldest messages will be dropped when there are more than 20 outstanding messages from the websocket. The `@channel/channel` package comes with three default `ChannelBuffer` classes: `FixedBuffer`, which causes pushes to park only when the buffer is full; `DroppingBuffer`, which drops the newest values when the buffer is full; and `SlidingBuffer`, which will drop the oldest values when the buffer is full. Because `DroppingBuffer` and `SlidingBuffer` drop messages, using them will ensure that calls to `push` will never throw. You can define custom buffer classes to add more complex value-dropping behavior to channels.
