---
id: overview
title: Overview
---

*NOTE: These docs assumes some familiarity with recent javascript features, specifically [promises](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises), [async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators). If you are unfamiliar with these features, what follows will not make much sense.*

## What are channels?

Channels are opaque objects which implement the methods found on the [async iterator interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to the next iteration result, and `Channel.prototype.return` closes the channel prematurely. Channels are most useful when consumed via [`for await…of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) loops, which call and await the channel’s `next`/`return` methods automatically.

Channels are designed with the explicit goal of behaving exactly like async generators and contain no methods or properties not found on the async iterator interface. If you discover a discrepancy between channels and async generators, please [open an issue](https://github.com/channeljs/channel/issues/new).

## Syntax

```js
const channel = new Channel(async (push, stop) => {
  push(1);
  push(2);
  await stop;
  return "goodbye!";
});

(async () => {
  console.log(await channel.next());   // => { value: 1, done: false }
  console.log(await channel.next());   // => { value: 2, done: false }
  console.log(await channel.return()); // => { value: "goodbye!", done: true }
})();
```

Inspired by the `Promise` constructor, the `Channel` constructor takes an *executor*, a function which is passed the arguments `push` and `stop`. These arguments are analogous to the `resolve` and `reject` functions passed to the promise executor: `push` can be called with a value so that `next` resolves to that value, and `stop` can be called with an error so that `next` rejects with that error. However, unlike `resolve`, `push` can be called more than once to enqueue multiple values, and unlike `reject`, `stop` can be called with no arguments to close the channel without error. Additionally, the `stop` argument is also a promise which resolves when the channel is stopped. As a promise, `stop` can be awaited to defer event handler cleanup, and it can also be used with `Promise.race` to abort pending promises.

These two arguments make it easy to setup and teardown callbacks within the executor, and they can be exposed to parent closures to model complex architectural patterns like [pubsub](packages/pubsub) and [semaphores](packages/limiters).
