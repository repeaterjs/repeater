---
id: rationale
title: Rationale
---

While [async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various perceived [flaws](https://github.com/apollographql/graphql-subscriptions/issues/116) and [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126). What’s needed is something like the `Promise` constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. The `Channel` constructor makes it easy to turn *any* callback-based source of data into an async iterator, and prevents common async iterator mistakes [by design](safety). The constructor pattern is easy to memorize and adaptable for almost every async iterator use case.

## Why not async generators?

Channels are meant to be used alongside async generators rather than replace them. The problem with using async generators exclusively is that they rely on the `yield`, `return` and `throw` statements to produce values, which are unavailable in child closures. 

```js
async function* messages(url) {
  const socket = new WebSocket(url);
  socket.onmessage = (ev) => {
     // can’t make the outer generator yield from here.
  };
}
```

The solution using async generators is often some ad-hoc `while (true)` loop which awaits a promise which adds and removes event handlers for each iteration. The resulting code is often prone to race-conditions, dropped messages, and memory leaks unless done with an expert understanding of generators and promises. Channels behave identically to async generators, except they provide the `yield`, `return` and `throw` statements as the functions `push` and `stop`. These functions give imperative control over channels in child closures, making channels ideal for use with callbacks.

Once you have converted callback-based APIs to channel-returning functions, channels can be used seamlessly with async generators to write rich, easy-to-understand async code.

## Why not observables?

Observables are often thought of as competing with async iterators and therefore channels, and it’s true that most channel code can be rewritten with observables. Here, for instance, is the [Konami code example](quickstart#listening-for-the-konami-code), rewritten using `rxjs`:

```js
import { Observable } from "rxjs";
import { takeWhile } from "rxjs/operators";
const keys = new Observable(subscriber => {
  const listener = ev => {
    if (ev.key === "Escape") {
      subscriber.complete();
    } else {
      subscriber.next(ev.key);
    }
  };
  window.addEventListener("keyup", listener);
  return () => window.removeEventListener("keyup", listener);
});

const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

let i = 0;
let subscription = keys
  .pipe(
    rxjs.operators.takeWhile(key => {
      if (key === konami[i]) {
        i++;
      } else {
        i = 0;
      }
      if (i >= konami.length) {
        console.log("KONAMI!!!");
        return false;
      }
      return true;
    }),
  )
  .subscribe();
```

While you can often create an equivalent observable for any channel, there are several differences that make channels much nicer to use. Firstly, channels support `async/await` and `for await…of` syntax, so we don’t need a library of “operators” like `takeWhile` to consume channels. Rather than using `map` operator, we can assign a variable, rather than using the `filter` operator, we can use an `if` statement, and rather than using the `takeWhile` or `takeUntil` operators, we can use a `break` statement. Using `for await…of` loops allows us to leverage what we already know about synchronous loops and control-flow statements to write cleaner, more intuitive code. I suspect that if observables ever [decided to support the async iterator protocol](https://github.com/ReactiveX/rxjs/issues/4002), the market for higher-order observable functions would collapse overnight.

Secondly, despite all the claims observable advocates make about how observables are “monadic” or that they are the “mathematical dual” of synchronous iterables, observables are ultimately callback-based APIs. This means that it’s difficult to use observables with promises and they suffer from the same issue of “callback hell” which promises were designed to solve. Observable libraries are aware of this and provide “higher-order observable operators” which work on observables of observables, but these solutions are seldom used and virtually incomprehensible to human beings, who don’t normally think in terms of extradimensional spaces.
