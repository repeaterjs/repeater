---
id: rationale
title: Rationale
---

While [async iterators](https://github.com/tc39/proposal-async-iteration) are available in most modern javascript runtimes, they have yet to achieve widespread usage due to various perceived [flaws](https://github.com/apollographql/graphql-subscriptions/issues/116) and [pitfalls](https://github.com/tc39/proposal-async-iteration/issues/126). What’s needed is something like the `Promise` constructor, which helped promises succeed by providing a common pattern for converting callback-based APIs into promises. Correspondingly, the `Repeater` constructor makes it easy to turn *any* callback-based source of data into an async iterator, and prevents common async iterator mistakes [by design](/docs/safety). The constructor pattern is easy to memorize and adaptable for almost every async iterator use case.

## Why not async generators?

Repeaters are meant to be used alongside async generators rather than replace them. The problem with using async generators exclusively is that they rely on the `yield`, `return` and `throw` operators to produce values, which are unavailable in nested function closures.

```js
async function* messages(url) {
  const socket = new WebSocket(url);
  socket.onmessage = (ev) => {
    // can’t make the outer generator yield from here.
    yield ev.data // this line is a syntax error
  };
}
```

The solution using async generators exclusively is often some ad-hoc `while (true)` loop which constructs and awaits a promise which adds and removes event handlers each iteration. The resulting code is often prone to race-conditions, dropped messages and memory leaks unless done with an expert understanding of both promises and generators. Repeaters behave identically to async generators, except they provide the `yield`, `return` and `throw` operators as the functions `push` and `stop`. These functions provide the same functionality as the `yield`, `return` and `throw` operators, but are also available in child closures, making them ideal for use with callback-based APIs.

Once you have converted callback-based APIs to repeater-returning functions, repeaters can be used seamlessly with async generators to write elegant async code.

## Why not observables?

Observables are often thought of as competing with async iterators and therefore repeaters, and most repeater code can be rewritten with observables. Here, for instance, is the [Konami example from the quickstart](quickstart#konami-code), rewritten using `rxjs`:

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
    takeWhile(key => {
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

While you can often create an equivalent observable for any repeater, there are differences which make repeaters more convenient.

Firstly, repeaters support `async/await` and `for await…of` syntax, so we don’t need a library of “operators” like `takeWhile` to prematurely end iteration. In the example above, someone unfamiliar with `rxjs` might not immediately recognize what `takeWhile` does or why the return value of its callback is a boolean, whereas the same programmer would probably recognize what a `break` statement in a `for await…of` loop does. Using `for await…of` loops means we get to leverage what we already know about synchronous loops and control-flow operators to write cleaner, more intuitive code. Rather than using the `map` operator, we can assign a variable, rather than using the `filter` operator, we can use `if/else` statements, and rather than using the `reduce` operator, we can reassign or mutate a variable in an outer scope.

Secondly, despite the claims observable advocates make about how observables are “monadic” or that they are the “mathematical dual” of synchronous iterables, observables are ultimately callback-based APIs. The above example hides this detail by calling the `subscribe` method without arguments, but if we wanted to compose this observable with other code, we would have to make additional calls to `pipe` and `subscribe`, passing in additional callbacks. While calls to `pipe` can be chained or combined using “higher-order observable operators,” the resulting code can be difficult to understand or split up into reasonably named functions.
