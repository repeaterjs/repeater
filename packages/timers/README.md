# @repeaterjs/timers
This package is experimental!

Cancelable timers, implemented with repeaters

For more information, visit [repeater.js.org](https://repeater.js.org).

```ts
function delay(wait: number): Repeater<number>;
```

`delay` returns a repeater which yields `Date.now()` `wait` milliseconds after `next` is called. Each call to `next` runs an independent timer. All outstanding timers can be canceled by calling `return`.

```ts
function timeout(wait: number): Repeater<undefined>;
```

`timeout` returns a repeater which rejects with a `TimeoutError` if the repeater does not receive another call to `next` or `return` after the specified `wait`. This behavior is useful when you want to place a fixed upper bound on how long each iteration of an async iterator can take with `Repeater.race`.

```js
import { Repeater } from "@repeaterjs/repeater";
import { timeout } from "@repeaterjs/timers";

const chan = new Repeater(async (push) => {
  await push(1);
  await push(2);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await push(3);
});

try {
  (async () => {
    for await (const num of Repeater.race([chan, timeout(1000)])) {
      console.log(num); // 1, 2
    }
  })();
} catch (err) {
  console.log(err); // TimeoutError: 1000 ms elapsed
}
```

```ts
function interval(wait: number, buffer?: RepeaterBuffer<number>): Repeater<number>;
```

`interval` returns a repeater which resolves with the current timestamp every `wait` milliseconds. The timer does not start until you call `next` on the returned iterator, and can be canceled by calling `return`.
