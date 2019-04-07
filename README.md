# Channel.js
## The missing constructor function for creating safe async iterators.

[Async iterators](https://github.com/tc39/proposal-async-iteration) are supported in most modern environments but have yet to reach widespread usage in the js community due to various [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126) and [gotchas](https://github.com/apollographql/graphql-subscriptions/issues/116). This library implements `Channel`, a minimal message queue which emulates the simplicity of the `Promise` constructor and helps developers avoids common mistakes when creating async iterators by design. It is inspired by Clojure’s `core.async` and works seamlessly with `async`, `await`, `for await…of`, and async generators.

## Usage

```js
import { Channel } from "@channel/channel";
// returns an async iterator which yields an incrementing number every second and stops when it reaches 5
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

Like [async generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*), channels are opaque objects which can only be read or closed via the methods found on the [`AsyncIterableIterator` interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to the next result of the iteration, and `Channel.prototype.return` closes the channel. Using [`for await…of` loops](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) is a convenient way to asynchronously call a channel’s `next` and `return` methods automatically much like `for…of` is used to iterator over synchronous iterators.

Like the [`Promise` constructor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise), the `Channel` constructor takes an *executor*, a function which is called with three arguments: `push`, `close` and `stop`. The `push` and `close` arguments are functions similar to the `resolve` and `reject` functions passed to the Promise executor: you can call `push` with a value so that the value can later be resolved with `next`, and you can call `close` with an error so that calling `next` will reject with that error. However, unlike `resolve`, `push` can be called multiple times to enqueue multiple values on the channel, and unlike `reject`, `close` can be called with no arguments to close the channel without an error. The `stop` argument is unique to the `Channel` executor: it is a promise which is resolved when the channel is closed. These three arguments allow developers to conveniently setup and teardown callbacks within the executor, and can be exposed to the parent closure to model complex async architectural patterns like [semaphores]() and [pubsub]().

## Examples

### interval

### pubsub

### semaphore

## How are channels “safe”?
Most async iterator libraries currently available make at least one of the following three errors which make them unsuitable for complex codebases or long-lived node processes.

### Bidirectional communcation
Many async iterator libraries currently available expose methods not on the `AsyncIterableIterator` interface as a convenience for consumers to push values onto the iterator. This is analogous to the obsolete [`Promise.defer`](https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Deferred) method and is unsafe in that it prevents async iterators from being passed freely between multiple consumers, because any consumer can mess with any other consumer by calling the methods in unexpected ways. The executor pattern is a nice way to hide the `push` and `close` abilities of the channel and enforce trict separation between producers and consumers of values, because within the executor you cannot reference the returned and channel, and you can only expose push and close deliberately by assigning them somewhere on the outside scope.

### Eager initialization
There are a lot of async iterator libraries which are wrappers on event emitters, streams or other callback-based APIs. Most, if not all make the crucial mistake of adding event listeners or callbacks when the async iterator is constructed, and tearing them down on when the iterator is closed. Consider the following naive async iterator returning function:

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
      target.removeEventListener(name, listener);
    }
  };
}
```

The code has several problems, but the most dangerous one is that return may never be called! Consider the following usage of listen:

```js
const clicks = listen(node, "click");
async function* positions(clicks) {
  for await (const c of clicks) {
    yield {
      x: c.clientX,
      y: c.clientY,
    };
  }
}
// never mind we’re not interested in the positions of clicks.
positions(clicks).return();
```

The position generator is meant to pull events from clicks and yield their position in terms of x/y coordinates, but the generator is returned before it is even executed, meaning the `for await…of` loop inside `positions` is never run and `clicks.return` is never called. This means that `target.addEventListener` has been called without calling `target.removeEventListener` and if it happens enough, will lead to memory leaks.

Unlike the naive example, channel executors are executed lazily; in other words, they don’t run the executor function until the first time `next` is called.
Here’s the listen function above using a channel:

```js
function listen(target, name) {
  return new Channel(async (next, _, stop) => {
    const listener = (ev) => push(ev);
    target.addEventListener(name, listener);
    await stop;
    target.removeEventListener(name, listener);
  });
}
```

If we swap in this listen function for the one above, `target.addEventListener` will never be called because the channel’s next method is never called, and the channel can be safely garbage collected without anyone knowing that it ever wanted to listen to click events at all.

Because channels initialize lazily, the contract for safely consuming channels which encapsulate event handlers or other limited resources is relatively simple: if you call `next`, you must call `return` when you no longer wish to receive values. This is handled automatically when using for await…of loops and is easy to enforce using manually using things when using control-flow constructs liike `try/finally`.

### Fast producers, slow consumers.

The naive `listen` function above had an additional, potentiallyy more insidious problem, which is that it pushes click events onto an unbounded array. One can imagine creating the async iterator and then ignoring the values while doing other tasks, meanwhile the user continues clicking and adding events to array, never to be consumed. While this might not be a problem for short-lived browser sessions, it becomes a larger problem when running long-live node.js processes for instance.

Channels provide four ways of to deal with this problem..

#### 1. Backpressure.

#### 2. Throwing errors.

#### 3. Dropping values.
