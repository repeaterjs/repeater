# Repeater.js
The missing constructor for creating safe async iterators.

For more information, visit [repeater.js.org](https://repeater.js.org).

## Installation

Repeater.js is available on [npm](https://www.npmjs.com/package/@repeaterjs/repeater) in the CommonJS and ESModule formats.

`$ npm install @repeaterjs/repeater`

`$ yarn add @repeaterjs/repeater`

## Examples

<h4 id="timestamps">Logging timestamps with setInterval</h4>

```js
import { Repeater } from "@repeaterjs/repeater";

const timestamps = new Repeater(async (push, stop) => {
  push(Date.now());
  const interval = setInterval(() => push(Date.now()), 1000);
  await stop;
  clearInterval(interval);
});

(async function() {
  let i = 0;
  for await (const timestamp of timestamps) {
    console.log(timestamp);
    i++;
    if (i >= 10) {
      console.log("ALL DONE!");
      break; // triggers clearInterval above
    }
  }
})();
```

<h4 id="websocket">Creating a repeater from a websocket</h4>

```js
import { Repeater } from "@repeaterjs/repeater";

const socket = new WebSocket("ws://echo.websocket.org");
const messages = new Repeater(async (push, stop) => {
  socket.onmessage = (ev) => push(ev.data);
  socket.onerror = () => stop(new Error("WebSocket error"));
  socket.onclose = () => stop();
  await stop;
  socket.close();
});

(async function() {
  for await (const message of messages) {
    console.log(message);
    if (message === "close") {
      console.log("Closing!");
      break; // closes the socket
    }
  }
})();

socket.onopen = () => {
  socket.send("hello"); // "hello"
  socket.send("world"); // "world"
  socket.send("close"); // "close", "Closing!"
};
```

<h4 id="konami-code">Listening for the <a href="https://en.wikipedia.org/wiki/Konami_Code">Konami Code</a> and canceling if <kbd>Escape</kbd> is pressed</h4>

```js
import { Repeater } from "@repeaterjs/repeater";

const keys = new Repeater(async (push, stop) => {
  const listener = (ev) => {
    if (ev.key === "Escape") {
      stop();
    } else {
      push(ev.key);
    }
  };
  window.addEventListener("keyup", listener);
  await stop;
  window.removeEventListener("keyup", listener);
});

const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

(async function() {
  let i = 0;
  for await (const key of keys) {
    if (key === konami[i]) {
      i++;
    } else {
      i = 0;
    }
    if (i >= konami.length) {
      console.log("KONAMI!!!");
      break; // removes the keyup listener
    }
  }
})();
```

<h4 id="observables">Converting an observable to an async iterator</h4>

```js
import { Subject } from "rxjs";
import { Repeater } from "@repeaterjs/repeater";

const observable = new Subject();
const repeater = new Repeater(async (push, stop) => {
  const subscription = observable.subscribe({
    next: (value) => push(value),
    error: (err) => stop(err),
    complete: () => stop(),
  });
  await stop;
  subscription.unsubscribe();
});

(async function() {
  try {
    for await (const value of repeater) {
      console.log("Value: ", value);
    }
  } catch (err) {
    console.log("Error caught: ", err);
  }
})();
observable.next(1);
// Value: 1
observable.next(2);
// Value: 2
observable.error(new Error("Hello from observable"));
// Error caught: Error: Hello from observable
```

## Requirements

The core `@repeaterjs/repeater` module has no dependencies, but requires the following globals in order to work:
- `Promise`
- `WeakMap`
- `Symbol`
  - `Symbol.iterator`
  - `Symbol.asyncIterator`

In addition, repeaters are most useful when used via `async/await` and `for await…of` syntax. You can transpile your code with babel or typescript to support enviroments which lack these features.

## What are repeaters?

*Note: These docs assume some familiarity with recent javascript features, specifically [promises](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises), [async/await](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Async_await) and [iterators/generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators).*

The `Repeater` object represents an asynchronous sequence of values. These values can be read using the methods found on the [async iterator interface](https://tc39.es/ecma262/#sec-asynciterator-interface). `Repeater.prototype.next` returns a promise which resolves to the next iteration result, and `Repeater.prototype.return` prematurely ends iteration. Repeaters are most useful when consumed via [`for await…of`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of) loops, which call and await the repeater’s `next` and `return` methods automatically.

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

In addition, the executor API exposes promises which resolve according to the state of the repeater. The `push` function returns a promise which resolves when `next` is called, and the `stop` function doubles as a promise which resolves when the repeater is stopped. As a promise, `stop` can be awaited to defer event listener cleanup.

```js
const repeater = new Repeater(async (push, stop) => {
  console.log("repeater started!");
  await push(1);
  console.log("pushed 1");
  await push(2);
  console.log("pushed 2");
  await stop;
  console.log("done");
});

(async () => {
  console.log(await repeater.next());
  // repeater started!
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

These two arguments make it easy to setup and teardown callbacks within the executor, and they can be exposed to parent closures to model architectural patterns like [generic pubsub classes](https://github.com/repeaterjs/repeater/blob/master/packages/pubsub) and [semaphores](https://github.com/repeaterjs/repeater/blob/master/packages/limiters).

## Acknowledgments

Thanks to Clojure’s `core.async` for inspiring the basic data structure and algorithm for pushing and pulling values. The implementation of repeaters is more or less based on [this presentation](https://vimeo.com/100518968) explaining `core.async` internals.

Thanks to [this StackOverflow answer](https://stackoverflow.com/a/47214496/1825413) for providing a helpful overview of the different types of async APIs available in javascript.
