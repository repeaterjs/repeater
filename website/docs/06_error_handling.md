---
id: error_handling
title: Error Handling
---

Because error handling is important for creating robust applications, repeaters are designed to catch and propagate any errors they receive in a predictable fashion. Every promise which is passed to a repeater is preemptively caught using `Promise.prototype.catch` to prevent unhandled rejections, and the errors are forwarded to the iterator methods `next`/`return`/`throw` so repeater consumers can handle them.

## The four ways a repeater can error

### 1. Calling `stop` with an error

The most common way to cause a repeater to error is to pass an argument to the `stop` function:

```js

const chan = new Repeater((push, stop) => {
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

When `stop` is called with an error, values which were previously pushed can continue to be pulled. When there are no more values, the final call to `next` rejects with the error. If the repeater is ended prematurely with the `return` method, the repeater drops any remaining values and rejects with the error.

As you can see in the example above, repeaters error only once before entering a finished state where all calls to `next` resolve to `{ done: true }`. This mirrors the behavior of async generator objects. Because repeaters can only be stopped once, only the first call to `stop` has an effect on the repeater, and any errors passed in subsequent calls to `stop` are dropped.

### 2. Calling the `throw` method

The async iterator interface defines an optional `throw` method which allows consumers to throw errors into the iterator. With async generators, yield statements can be wrapped in a `try` block to catch these errors. Repeaters implement the throw method, but don’t have any methods for recovering from errors thrown in.

```js
const chan = Repeater((push, stop) => {
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

The `throw` method is equivalent to calling the `stop` function and `return` method in sequence, so `throw` blows away any pending values and finishes the repeater. Because `throw` rethrows errors if there are no pending calls to `next`, this method is of limited utility and mainly provided for compatability purposes.

### 3. The executor throws an error

The repeater constructor catches both synchronous and asynchronous errors thrown by the executor.

```js
const chan = new Repeater((push, stop) => {
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

When an error occurs in the executor, the repeater is automatically stopped. Because errors which occur in the executor are usually indicative of a programming mistake, the error thrown by the executor takes precedence over errors passed via `stop` or `throw`, regardless of when they were passed to the repeater.

### 4. A promise passed to the `push` function rejects

```js
const chan = new Repeater(async (push, stop) => {
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

Repeaters unwrap promises and promise-like objects which are passed to `push`. If a promise passed to `push` rejects, the repeater finishes and any further pending values are dropped. The pushed rejection is like a time-bomb which blows up the repeater and prevents any more values from being pulled, regardless of when those values settled. A rejection which resolves before the repeater is stopped takes precedence over all other errors passed to repeaters. However, if a pushed rejection settles *after* the repeater has already stopped, the rejection is dropped and the repeater yields `{ done: true }` instead. This behavior is useful when creating [inverted repeaters](inverted-repeaters).
