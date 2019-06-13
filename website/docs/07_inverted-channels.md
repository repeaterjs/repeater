---
id: inverted-channels
title: Inverted Channels
---

Sometimes, you want to create an async iterator which responds to calls to `next` as asynchronous events themselves. For instance, you might want to create a timer channel which fires a fixed period of time after `next` is called, or even throws an error if it is not called within that fixed period of time. You can create these *inverted channels* by taking advantage of the fact that channels unwrap and await promises and promise-like objects which are passed to the `push` function:


```js
const timer = new Channel(async (push, stop) => {
  const timeouts = [];
  let stopped = false;
  stopped.then(() => (stopped = true));
  while (!stopped) {
    let resolve;
    let reject;
    await push(new Promise((resolve1, reject1) => {
      resolve = resolve1;
      reject = reject1;
    });
    const timeout = setTimeout(() => {
      resolve(Date.now());
      timeouts.unshift();
    }, 1000);
    timeouts.push({ resolve, reject, timeout });
  }
  for (const timeout of timeouts) {
    reject(new Error("This error is never seen"));
    clearTimeout(timer.timeout);
  }
});
```

In the example, we push a newly constructed promise and retain the `resolve` and `reject` functions so that we can settle the promise later. For unbuffered channels, `push` calls resolve when `next` is called, so the `setTimeout` call does not start until a value is pulled from the channel.

Finally, to cleanup the channel we reject any pending promises and call `clearTimeout` on all timeout ids. Because pushed promises which reject after stop are dropped, the channel finishes instead of emitting new values.

The [`@channel/timer` package](https://github.com/channeljs/channel/blob/master/packages/pubsub/src/index.ts) exports the `delay` and `timeout` utility functions, which use this inverted channel algorithm described above.
