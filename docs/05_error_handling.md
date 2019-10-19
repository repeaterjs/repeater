---
id: error_handling
title: Error Handling
---

Because error handling is an important part of creating robust applications, repeaters are designed to catch and propagate any errors they receive in a predictable manner. Every promise which is passed to a repeater is preemptively caught using `Promise.prototype.catch` to prevent unhandled rejections, and the errors are then forwarded to consumers during iteration.

## The four ways a repeater can error

### 1. Calling `stop` with an error

The most common way to pass an error to a repeater is to call the `stop` function with the error.

```js
const chan = new Repeater((push, stop) => {
  for (let i = 0; i < 100; i++) {
    push(i);
  }
  stop(new Error("Stop in the name of love 😘"));
});

(async function() {
  try {
    console.log(await chan.next()); // { value: 0, done: true }
    console.log(await chan.next()); // { value: 1, done: true }
    console.log(await chan.next()); // { value: 2, done: true }
    console.log(await errorChan().return()); // This line throws an error.
  } catch (err) {
    console.log(err); // Error: Stop in the name of love 😘
  } finally {
    console.log(await chan.next()); // { done: true }
    console.log(await chan.next()); // { done: true }
  }
})();
```

When `stop` is called with an error, values which were previously pushed can continue to be pulled. After all previously pushed values are exhausted, the final call to `next` rejects with the error. If the repeater is prematurely returned, the repeater drops any remaining values and rejects with the error.

As seen in the example above, repeaters error only once before entering a finished state where all calls to `next` resolve to `{ done: true }`. This mirrors the finishing behavior of async generator objects. Only the first call to `stop` has any effect on the repeater, and any errors passed to `stop` in subsequent calls are dropped.

### 2. The executor throws an error

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

(async function() {
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

When an error occurs in the executor, the repeater is stopped. Because errors
which occur in the executor are usually indicative of a programming mistake, the error thrown by the executor takes precedence over any errors passed via `stop`, regardless of when they were passed to the repeater.  

### 3. A promise passed to the `push` function rejects

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

(async function() {
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

Repeaters unwrap promises and thenables passed to `push`. If a promise passed to `push` rejects, the repeater finishes and any further pending values are dropped. A rejection which settles before the repeater is stopped takes precedence over all other errors. However, if a pushed rejection settles *after* the repeater has already stopped, the rejection is dropped. This behavior is useful when creating [inverted repeaters](/docs/inverted-repeaters).

### 4. Calling the `throw` method

The async iterator interface defines an optional `throw` method which allows consumers to throw errors into the iterator. With async generators, `throw` will resume the generator and throw the error at the point of `yield`. Generators can recover from these errors by wrapping `yield` operations in a `try`/`catch` block.

Repeaters allow for errors to be thrown in by causing the promise returned from the previous `push` call to reject with the error.

```js
const chan = Repeater(async (push) => {
  for (let i = 0; i < 10; i++) {
    try {
      await push(i);
    } catch (err) {
      console.log(err);
      throw new Error("Hello yes I caught your error 👀");
    }
  }
});

(async function() {
  try {
    console.log(await chan.next()); // { value: 1, done: false };
    console.log(await chan.throw("This error is passed to push 📞")); // This line throws an error.
    // Error: This error is passed to push 📞
  } catch (err) {
    console.log(err); // Error: Hello yes I caught your error 👀
  } finally {
    console.log(await chan.next()); // { done: true }
  }
})();
```

By default, errors passed to `push` are caught using `Promise.prototype.catch` to prevent unhandled rejections, and iteration continues normally. Therefore, if you want the `throw` method to bubble out of the repeater, you must either call `stop` with the error or rethrow the error from the executor.
