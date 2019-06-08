---
id: errors
title: Dealing with Errors
---

Because error handling is important for creating robust applications, channels are designed to catch and propagate any errors and promise rejections they receive in a predictable fashion. Every promise which a channel consumes is preemptively caught using the `Promise.prototype.catch` method so there is no possibility for unhandled rejections, and errors will cause the `next`/`return`/`throw` methods to reject depending on when or how the errors occur. If you encounter an unhandled promise rejection which could not have been handled via the async iterator methods, please [open an issue](https://github.com/channeljs/channel/issues/new).

There are four ways channels can error:

### 1. Calling `stop` with an error

The most common way to cause a channel to throw is to pass an error as an argument to the `stop` function:

```js

const chan = new Channel((push, stop) => {
  for (let i = 0; i < 100; i++) {
    push(i);
  }
  stop(new Error("Stop in the name of love 😘"));
});

(async () => {
  try {
    console.log(await chan.next()); // { value: 0, done: true }
    console.log(await chan.next()); // { value: 1, done: true }
    console.log(await chan.next()); // { value: 2, done: true }
    // This line throws an error.
    console.log(await errorChan().return());
  } catch (err) {
    console.log(err); // Error: Stop in the name of love 😘
  } finally {
    console.log(await chan.next()); // { done: true }
    console.log(await chan.next()); // { done: true }
  }
})();
```

When `stop` is called with a non-null/undefined argument, values which were previously pushed can continue to be pulled and the channel will throw the error as a promise rejection only when all pending pushes have been consumed. However, if the channel is ended prematurely with the `return` method, the channel will throw the error immediately and finish.

As you can see in the example above, channels error only once before entering a finished state where all calls to `next` return `{ done: true }`. This mirrors the behavior of generator objects. Because channels can only be stop once, only the first call to `stop` will have an effect on the channel. Any errors passed to an already stopped channel will be dropped.

### 2. Calling the `throw` method

The async iterator interface defines an optional `throw` method allowing consumers to throw errors into the iterator. With async generators, yield statements can be wrapped in a `try/catch` block to catch errors thrown into the generator using the `throw` method. Channels implement this method as well, but don’t have any methods for recovering from these errors.

```js
const chan = Channel((push, stop) => {
  for (let i = 0; i < 10; i++) {
    push(i);
  }
});

(async () => {
  try {
    const next = chan.next();
    // this line does not throw because there is a pending call to next
    console.log(await chan.throw("This error is passed to next 📞")); // { done: true } 
    // this line throws the error above
    console.log(await next);
  } catch (err) {
    console.log(err); // Error: This error is passed to next 📞
  } finally {
    console.log(await chan.next()); // { done: true }
  }
})();
```

The `throw` method is equivalent to calling the `stop` function and `return` method in sequence, so `throw` will blow away any pending pushes and finish the channel. Because `throw` rethrows errors if there are no pending pulls, this method is of limited utility and mainly provided for compatability purposes.

### 3. The executor throws an error

The channel constructor will catch both synchronous and asynchronous errors thrown by the executor.

```js
const chan = new Channel((push, stop) => {
  push("a");
  push("b");
  push("c");
  // this error is dropped
  stop(new Error("My error"));
  // this error takes priority
  throw new Error("This executor is busted ☠️");
});

(async () => {
  try {
    for await (const letter of chan) {
      console.log(letter); // "a", "b", "c"
    }
  } catch (err) {
    console.log(err); // Error: This executor is busted ☠️
  } finally {
    console.log(await chan.next()); // { done: true }
  }
})();
```

When an error occurs in the executor, the channel will be stopped automatically. Because errors which occur in the executor are usually indicative of programmer error, the error thrown by the executor takes precedence over any errors passed via `stop` or `throw`, regardless of call order.

### 4. A promise passed to the `push` function rejects

```js
const chan = new Channel(async (push, stop) => {
  await push("a");
  await push("b");
  await push("c");
  await push(new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("A rejection passed to push ⏰"));
    }, 100);
  }));
  // these values are ignored
  await push("e");
  await push("f");
  // these errors are ignored
  stop(new Error("My error"));
  throw new Error("this executor is busted");
});

(async () => {
  try {
    for await (const letter of chan) {
      console.log(letter); // "a", "b", "c"
    }
  } catch (err) {
    console.log(err); // Error: A rejection passed to push ⏰
  } finally {
    console.log(await chan.next()); // { done: true }
  }
})();
```

Channels automatically unwrap promises and promise-like objects which are passed to `push`. If a promise passed to `push` rejects, the channel will finish and any pending pushes or values in the buffer which were pushed after the rejection are dropped. The pushed rejection is like a time-bomb which blows up the channel and prevents any further values from being pulled, regardless of when those values settle. A rejection which resolves before the channel is stopped takes precedence over errors passed via `stop`, `throw`, or thrown errors. However, if a pushed rejection settles *after* the channel has already stopped, the rejection is dropped and the channel emits `{ done: true }` instead.
