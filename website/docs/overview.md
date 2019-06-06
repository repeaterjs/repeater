---
id: overview
title: Overview
---

Channels are opaque objects which implement the methods found on the [AsyncIterableIterator interface](https://github.com/Microsoft/TypeScript/blob/master/lib/lib.es2018.asynciterable.d.ts). `Channel.prototype.next` returns a promise which resolves to the next result, and `Channel.prototype.return` closes the channel prematurely. Async iterators are most useful when consumed via [`for await…of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) loops, which call and await the channel’s `next`/`return` methods automatically. Channels are meant to be indistinguishable from async generators, so if you discover a difference in behavior, please [open an issue](https://github.com/channeljs/channel/issues/new).

## Syntax

<pre><code>
new Channel(executor);
</code></pre>

Similar to the `Promise` constructor, the `Channel` constructor takes an *executor*, a function which is passed the arguments `push`, `close` and `stop`. The `push` and `close` arguments are functions analogous to the `Promise` executor’s `resolve` and `reject` arguments: `push` can be called with a value so that `next` resolves to that value, and `close` can be called with an error so that `next` rejects with that error. However, unlike `resolve`, `push` can be called more than once to enqueue multiple values onto the channel, and unlike `reject`, `close` can be called with no arguments to close the channel without error. The `stop` argument is unique to the `Channel` executor: it is a promise which resolves when the channel is closed. These three arguments make it easy to setup and teardown callbacks within the executor, and they can be selectively exposed to parent closures to model architectural patterns like [pubsub](packages/pubsub) and [semaphores](packages/limiters).
