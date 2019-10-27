---
id: inverted_repeaters
title: Inverted Repeaters
---

Sometimes you want to create async iterators which respond to calls to `next` as asynchronous events themselves. For instance, you might want create a timer which fires a fixed period of time after `next` is called, or even throws an error if it is not called within that fixed period of time. You can create these *inverted repeaters* by taking advantage of the fact that repeaters unwrap and await promises passed to the `push` function.


```js
const timer = new Repeater(async (push, stop) => {
  const timers = [];
  let stopped = false;
  stopped.then(() => (stopped = true));
  try {
    while (!stopped) {
      let resolve;
      let reject;
      const promise = new Promise((resolve1, reject1) => {
        resolve = resolve1;
        reject = reject1;
      });
      const timer = {
        resolve,
        reject,
        timeout: setTimeout(() => {
          resolve(Date.now());
          timers.unshift();
        }, 1000),
      };
      timers.push(timer);
      await push(promise);
    }
  } finally {
    for (const timer of timers) {
      timer.reject(new Error("This error is never seen"));
      clearTimeout(timer.timeout);
    }
  }
});
```

In the example above, we create a promise and retain its `resolve` and `reject` functions so that we can settle the promise later. We then call `setTimeout` and `push` the promise. Next, we await the `push` call so that we can create more timeouts as needed by the consumer.

Finally, to cleanup the repeater, we reject any pending promises and call `clearTimeout` on all outstanding timeouts. Because pushed promises which reject after `stop` are dropped, the repeater finishes instead of producing new values.

The [`@repeaterjs/timer` package](https://github.com/repeaterjs/repeater/blob/master/packages/timers) exports the `delay` and `timeout` utility functions, which use this inverted repeater pattern described above.
