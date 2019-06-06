---
id: quickstart
title: Quickstart
---

## Installation
Channel.js is available on npm under the scoped package name `@channel/channel`.

`$ npm install @channel/channel`

`$ yarn add @channel/channel`


## Examples

Logging a timestamp every second and stopping after ten iterations.

```js
import { Channel } from "@channel/channel";

const timestamps = new Channel(async (push, _, stop) => {
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

Logging messages from a websocket and closing if we receive the message "close".

```js
import { Channel } from "@channel/channel";

const messages = new Channel(async (push, close, stop) => {
  const socket = new WebSocket("ws://localhost:3000");
  socket.onmessage = (ev) => push(ev.data);
  socket.onerror = () => close(new Error("WebSocket error"));
  socket.onclose = () => close();
  await stop;
  socket.close();
});

(async function() {
  for await (const message of messages) {
    console.log(message);
    if (message === "close") {
      break;
    }
  }
})();
```

Listening for the [Konami Code](https://en.wikipedia.org/wiki/Konami_Code) and canceling if <kbd>Escape</kbd> is pressed.

```js
import { Channel } from "@channel/channel";

const keys = new Channel(async (push, close, stop) => {
  const listener = (ev) => {
    if (ev.key === "Escape") {
      close();
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
      break; // closes the channel and removes the keyup listener
    }
  }
})();
```
