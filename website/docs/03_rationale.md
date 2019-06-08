---
id: rationale
title: Rationale
---

While [async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various perceived [flaws](https://github.com/apollographql/graphql-subscriptions/issues/116) and [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126). What’s needed is something like the `Promise` constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. The `Channel` constructor makes it easy to turn *any* callback-based source of data into an async iterator, and prevents common async iterator mistakes [by design](safety). The channel constructor is easy to memorize and is adaptable for almost every async iterator use case.

## Why not async generators?

Channels are meant to be used alongside async generators. The problem with using async generators exclusively is that they rely on the `yield`, `return` and `throw` statements to produce values, which are unavailable in child closures. 

```js
async function* messages(url) {
  const socket = new WebSocket(url);
  socket.onmessage = (ev) => {
     // can’t make the outer generator yield from here.
  };
}
```

The solution using async generators is often some ad-hoc `while (true)` loop which awaits a promise which adds and removes an event handler for each iteration, but the results are often prone to race-conditions, dropped messages, and memory leaks unless done with a very solid understanding of how generators and promises work. Channels behave identically to async generators, except they provide the `yield`, `return` and `throw` statements as the functions `push` and `stop`, allowing imperative control of the channel outside of the immediate function closure and making channels ideal for converting callback-based APIs into async iterators. Once you have converted callback-based APIs into channels, you can use channels seamlessly with async generators to write rich, easy-to-understand async code.

## Why not Observables?

**👷‍♀️ Under Construction 👷‍♂️**
