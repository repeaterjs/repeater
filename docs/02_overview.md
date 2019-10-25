---
id: overview
title: Overview
---

## What are repeaters?

*Note: These docs assume some familiarity with recent javascript features, specifically [promises](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises), [async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators).*

Repeaters are opaque objects which implement the methods found on the [async iterator interface](https://tc39.es/ecma262/#sec-asynciterator-interface). `Repeater.prototype.next` returns a promise which resolves to the next iteration result, and `Repeater.prototype.return` prematurely ends iteration. Repeaters are most useful when consumed via [`for await…of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) loops, which call and await the repeater’s `next` and `return` methods automatically.

Repeaters are designed with the explicit goal of behaving exactly like async generator objects and contain no methods or properties not found on async iterator interface. If you discover a discrepancy between repeaters and async generators, please [open an issue](https://github.com/repeaterjs/repeater/issues/new).

## Creating repeaters

Inspired by the `Promise` constructor, the `Repeater` constructor takes an *executor*, a function which is passed the arguments `push` and `stop`. These arguments are analogous to the `resolve` and `reject` functions passed to the promise executor: `push` can be called with a value so that `next` resolves to that value, and `stop` can be called with an error so that `next` rejects with that error.

```js
const repeater = new Repeater((push, stop) => {
  push(1);
  stop(new Error("My error"));
});

(async () => {
  console.log(await repeater.next());   // { value: 1, done: false }
  try {
    console.log(await repeater.next()); // This line throws an error.
  } catch (err) {
    console.log(err); // Error: My error
  }
})();
```

However, unlike `resolve`, `push` can be called more than once to enqueue multiple values, and unlike `reject`, `stop` can be called with no arguments to close the repeater without error.

```js
const repeater = new Repeater((push, stop) => {
  push(1);
  push(2);
  push(3);
  push(4);
  stop();
});

(async () => {
  console.log(await repeater.next()); // { value: 1, done: false }
  console.log(await repeater.next()); // { value: 2, done: false }
  console.log(await repeater.next()); // { value: 3, done: false }
  console.log(await repeater.next()); // { value: 4, done: false }
  console.log(await repeater.next()); // { done: true }
})();
```

In addition, the executor API exposes promises which resolve according to the state of the repeater. The `push` function returns a promise which resolves the next time `next` is called, and the `stop` function doubles as a promise which resolves when the repeater is stopped. As a promise, `stop` can be awaited to defer event listener cleanup.

```js
const repeater = new Repeater(async (push, stop) => {
  await push(1);
  console.log("pushed 1");
  await push(2);
  console.log("pushed 2");
  await stop;
  console.log("done");
});

(async () => {
  console.log(await repeater.next());
  // { value: 1, done: false }
  console.log(await repeater.next());
  // "pushed 1"
  // { value: 2, done: false }
  console.log(await repeater.return());
  // "pushed 2"
  // "done"
  // { done: true }
})();
```

These two arguments make it easy to setup and teardown callbacks within the executor, and they can be exposed to parent closures to model architectural patterns like [generic pubsub classes](https://github.com/repeaterjs/repeater/blob/master/packages/pubsub/src/index.ts) and [semaphores](https://github.com/repeaterjs/repeater/blob/master/packages/limiters/src/index.ts).

## Acknowledgments

Thanks to Clojure’s `core.async` for inspiring the basic data structure and algorithm for pushing and pulling values. Specifically, the implementation of repeaters is more or less based on [this video](https://vimeo.com/100518968) explaining `core.async` internals.

Thanks to [this StackOverflow answer](https://stackoverflow.com/a/47214496/1825413) for providing a helpful overview of the different types of async APIs available in javascript.
