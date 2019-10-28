---
id: error_handling
title: Error Handling
---

Because error handling is an important part of creating robust applications, repeaters catch and propagate any errors they receive in a predictable, well-specified manner. Every promise which is passed to a repeater is preemptively caught to prevent unhandled promise rejections.

## The four ways a repeater can error

### 1. Calling `stop` with an error

The most common way to cause a repeater to error is to call the `stop` function with the error.

```js
const repeater = new Repeater((push, stop) => {
  for (let i = 0; i < 100; i++) {
    push(i);
  }

  stop(new Error("Stop in the name of love 😘"));
});

(async function() {
  try {
    console.log(await repeater.next()); // { value: 0, done: true }
    console.log(await repeater.next()); // { value: 1, done: true }
    console.log(await repeater.next()); // { value: 2, done: true }
    console.log(await repeater.return()); // This line throws an error.
  } catch (err) {
    console.log(err); // Error: Stop in the name of love 😘
  } finally {
    console.log(await repeater.next()); // { done: true }
    console.log(await repeater.next()); // { done: true }
  }
})();
```

When `stop` is called with an error, values which were previously pushed can continue to be pulled. After all previously pushed values are exhausted, the final call to `next` rejects with the error. If the repeater is prematurely finished using `Repeater.prototype.return`, the repeater drops any remaining values and rejects the final iteration with the error.

As seen in the example above, repeaters error only once before entering a finished state where all calls to `next` resolve to `{ done: true }`. This mirrors the finishing behavior of async generator objects. Only the first call to `stop` has any effect on the repeater, and any errors passed to `stop` in subsequent calls are dropped.

### 2. A promise passed to the `push` function rejects

```js
const repeater = new Repeater(async (push, stop) => {
  await push("a");
  await push("b");
  await push("c");
  await push(new Promise((_, reject) => {
    setTimeout(() => reject(new Error("A rejection passed to push ⏰")), 100);
  }));
  // these values are dropped
  await push("e");
  await push("f");
  // this error is ignored
  stop(new Error("Stop in the name of love 😘"));
});

(async function() {
  try {
    for await (const letter of repeater) {
      console.log(letter); // "a", "b", "c"
    }
  } catch (err) {
    console.log(err); // Error: A rejection passed to push ⏰
  } finally {
    console.log(await repeater.next()); // { done: true }
  }
})();
```

Repeaters unwrap promises passed to `push` before sending them along to consumers. If a promise passed to `push` rejects, the repeater finishes and any further values which were pushed before the promise rejected are dropped, regardless of when those values settled. If the rejection settles *before* the repeater stops, the final iteration rejects with the pushed rejection. However, if it settles *after* the repeater has stopped, the rejection is dropped. This behavior is useful when creating [inverted repeaters](/docs/inverted-repeaters).

### 3. The executor throws an error

Repeaters catch both synchronous and asynchronous errors thrown by the executor.

```js
const repeater = new Repeater((push, stop) => {
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
    for await (const letter of repeater) {
      console.log(letter); // "a", "b", "c"
    }
  } catch (err) {
    console.log(err); // Error: This executor is busted ☠️
  } finally {
    console.log(await repeater.next()); // { done: true }
  }
})();
```

When an error occurs in the executor, the repeater is stopped and the final iteration rejects with the error. Because errors thrown by the executor are usually indicative of programmer error, they take precedence over all other errors passed to the repeater.  

### 4. Calling the `throw` method

The async iterator interface defines an optional `throw` method which allows consumers to throw errors into the iterator. With async generators, the `throw` method resumes the generator and throws the error at the point of the suspended `yield` operator. Generators can recover from these errors by wrapping `yield` operations in a `try` block.

Repeaters simulate this behavior by causing the promise returned from the previous `push` call to reject.

```js
const repeater = Repeater(async (push) => {
  for (let i = 0; i < 10; i++) {
    try {
      await push(i);
    } catch (err) {
      console.log(err);
      console.log("Hello I caught your error 👀");
    }
  }
});

(async function() {
  console.log(await repeater.next()); // { value: 1, done: false };
  console.log(await repeater.throw(new Error("Hello? 📞"))); 
  // Error: Hello? 📞
  // Hello I caught your error 👀
  // { value: 2, done: false }
  console.log(await repeater.next()); // { value: 3, done: false };
  console.log(await repeater.next()); // { value: 4, done: false };
})();
```

The promise returned from `push` has special behavior where if it is “floating,” i.e. it is not awaited and its `then/catch` methods are not called, the `throw` method rethrows the error passed in. This makes it safe to ignore the promise returned from `push`. However, if you await or otherwise use the `push` promise, it becomes your responsibility to handle and propagate errors passed to `throw`.

*Note: The `throw` method will also immediately rethrow its error if the repeater has not been started, the repeater has stopped, or the repeater has a non-empty buffer, because in each of these cases, there is no corresponding `push` call which can reject with the error.*
