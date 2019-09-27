# Repeater.js
The missing constructor for creating safe async iterators.

For more information, visit [repeater.js.org](https://repeater.js.org).

## Installation

Repeater.js is available on [npm](https://www.npmjs.com/package/@repeaterjs/repeater) in the CommonJS and ESModule formats.

`$ npm install @repeaterjs/repeater`

`$ yarn add @repeaterjs/repeater`

## Requirements

The `@repeaterjs/repeater` package has no dependencies, but requires the following globals in order to work:
- `Promise`
- `Symbol.iterator`
- `Symbol.asyncIterator`
- `WeakMap`

In addition, repeaters are most useful when used via `async/await` and `for await…of` statements. You can compile your code with babel or typescript to support enviroments which lack these syntax features.

## Examples

#### Logging timestamps with setInterval

```js
import { Repeater } from "@repeaterjs/repeater";

const timestamps = new Repeater(async (push, stop) => {
  push(Date.now());
  const timer = setInterval(() => push(Date.now()), 1000);
  await stop;
  clearInterval(timer);
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

#### Creating a repeater from a websocket

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

#### Listening for the [Konami Code](https://en.wikipedia.org/wiki/Konami_Code) and canceling if <kbd>Escape</kbd> is pressed

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

## Acknowledgments

Thanks to Clojure’s `core.async` for inspiration. Specifically, the implementation of repeaters is more or less based on [this video](https://vimeo.com/100518968) explaining `core.async` internals.

Thanks to [this StackOverflow answer](https://stackoverflow.com/a/47214496/1825413) for providing a helpful overview of the different types of async APIs available in javascript.
