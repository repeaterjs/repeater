---
id: quickstart
title: Quickstart
---

## Installation

Channel.js is available on [npm](https://www.npmjs.com/package/@channel/channel) in the CommonJS and ESModule formats.

`$ npm install @channel/channel`

`$ yarn add @channel/channel`

## Requirements

The `@channel/channel` package has no dependencies, but requires the following globals in order to work:
- `Promise`
- `Symbol.iterator`
- `Symbol.asyncIterator`
- `WeakMap`

In addition, channels are most useful when used with `async/await` and `for await… of` statements. You can compile your code with babel or typescript to support enviroments which lack these syntax features.

## Examples

#### Logging timestamps with setInterval

```js
import { Channel } from "@channel/channel";

const timestamps = new Channel(async (push, stop) => {
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

#### Creating a channel from a websocket

```js
import { Channel } from "@channel/channel";

const messages = new Channel(async (push, stop) => {
  const socket = new WebSocket("ws://localhost:3000");
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
      break; // closes the socket
    }
  }
})();
```

#### Listening for the [Konami Code](https://en.wikipedia.org/wiki/Konami_Code)

```js
import { Channel } from "@channel/channel";

const keys = new Channel(async (push, stop) => {
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
