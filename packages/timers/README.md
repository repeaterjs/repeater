# @channel/timers
This package is experimental!

Cancelable timers, implemented with channels

For more information, visit [channel.js.org](https://channel.js.org).

```ts
function delay(wait: number): Channel<number>;
```

`delay` returns a channel which yields `Date.now()` `wait` milliseconds after `next` is called. Each call to `next` runs an independent timer. All outstanding timers can be canceled by calling `return`.

```ts
function timeout(wait: number): Channel<undefined>;
```

`timeout` returns a channel which rejects with a `TimeoutError` if the channel does not receive another call to `next` or `return` after the specified `wait`. This behavior is useful when you want to place a fixed upper bound on how long each iteration of an async iterator can take with `Channel.race`.

```js
import { Channel } from "@channel/channel";
import { timeout } from "@channel/timers";

const chan = new Channel(async (push) => {
  await push(1);
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await push(3);
});

try {
  (async () => {
    for await (const num of Channel.race([chan, timeout(1000)])) {
      console.log(num); // 1, 2
    }
  })();
} catch (err) {
  console.log(err); // TimeoutError: 1000 ms elapsed
}
```

```ts
function interval(wait: number, buffer?: ChannelBuffer<number>): Channel<number>;
```

`interval` returns a channel which resolves with the current timestamp every `wait` milliseconds. The timer does not start until you call `next` on the returned iterator, and can be canceled by calling `return`.
