# @repeaterjs/repeater
The missing constructor for creating safe async iterators

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
## API

## The `Repeater` class
```ts
class Repeater<T, TReturn = any, TNext = unknown> {
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>, buffer?: RepeaterBuffer,
  );
}
```

The `Repeater` object represents an asynchronous sequence of values. The `Repeater` class implements the `AsyncIterableIterator` interface and can be consumed using a `for await…of` loop or by calling the `next`, `return` and `throw` methods directly.

The type parameters `T`, `TReturn` and `TNext` correspond to the type parameters passed to the `AsyncIterator` interface provided by the built-in TypeScript library.

### constructor
##### Parameters
- `executor` - A function which is called when the repeater is started.
- `buffer` - An optional buffer object which allows the repeater to store or drop values.

#### The `executor` function 
```ts
type RepeaterExecutor<T, TReturn = any, TNext = unknown> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;
```

The `executor` passed to the repeater is called with the arguments `push` and `stop`. These arguments can be used to manipulate the state of the repeater.

If the `executor` throws an error, the repeater is automatically stopped and the final iteration rejects with the error. If the executor returns normally, the return value of the executor is used as the final value of the repeater.

#### The `push` argument 
```ts
type Push<T, TNext = unknown> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;
```

The `push` argument is a function which can be called with a value to enqueue the value on the repeater. Consumers can then pull the pushed value using `Repeater.prototype.next`. If the value passed to `push` is a promise, the repeater unwraps the promise before passing it to consumers.

The `push` function synchronously throws an error if there are too many pending pushes on the repeater.

##### Parameters
- `value` - the value to pass to repeater consumers.

##### Return value
The `push` function returns a promise which fulfills or rejects depending on the state of the repeater:

1. If the repeater is stopped, the returned promise resolves to `undefined`.
2. If the repeater has a non-empty buffer, the returned promise resolves to `undefined`.
3. `Repeater.prototype.next` resolves the previous `push` call to the value passed to the `next` method. If the repeater is consumed using a `for await…of` loop, this promise resolves to `undefined`.
4. If `Repeater.prototype.throw` is called, the previous `push` call rejects. It is not necessary to use or catch the returned promise because repeaters detects when the promise is unhandled and rethrow its rejection to the caller of the `throw` method.

#### The `stop` argument
```ts
type Stop = ((error?: any) => undefined) & Promise<undefined>;
```

The `stop` argument is both a function and a promise.

##### Parameters
- error: An optional error.

As a function, `stop` can be called to stop the repeater, preventing any further values from being pushed. Calling `stop` without arguments stops the repeater without error, and calling `stop` with an error both stops the repeater and causes the final iteration to reject with that error.

As a promise, `stop` resolves when `stop` is called, when `Repeater.prototype.return` is called, when a promise rejection is passed to push, or when the executor throws an error. It can be awaited to defer event handler cleanup, and it can be used with `Promise.race` to abort pending promises. The `stop` promise always resolves to `undefined` and never rejects.

### `Repeater.prototype.next`
```ts
class Repeater {
  next(value?: PromiseLike<TNext> | TNext): Promise<IteratorResult<T>>;
}
```

The `next` method returns an object with the properties `done` and `value`. You can also provide a parameter to the next method to send a value back to the repeater.

##### Parameters
- `value` - The value to send to the repeater. The previous `push` call resolves to this value.

##### Return value
A promise which fulfills to an object with the following properties:

- `done` - a boolean which indicates whether there are more values to be pulled.
- `value`
  - If `done` is true, `value` is either be `undefined` or the return value of the `executor`.
  - If `done` is false the `value` is a value passed to `push`.

The `next` function synchronously throws an error if there are too many pending calls to `next` on the repeater.

### `Repeater.protoype.return`
```ts
class Repeater {
  return(value?: PromiseLike<TReturn> | TReturn): Promise<IteratorResult<T>>;
}
```

The `return` method prematurely finishes the repeater. When returned, any pending values on the repeater are dropped. Additionally, the `executor`’s return value is ignored.

##### Parameters
- `value` - The value to return. If `value` is a promise, `return` awaits the value before returning it.

##### Return value
A promise which fulfills to an object with following properties:

- `done` - true
- `value` - the value passed to `return`.

### `Repeater.prototype.throw`
```ts
class Repeater {
  throw(error?: any): Promise<IteratorResult<T>>;
}
```

The `throw` method causes the previous `push` call to reject with the given error. If the executor fails to handle the `error`, the `throw` method rethrows the error and finish the repeater. A `throw` method call is detected as unhandled in the following situations:

- The repeater has not started (`Repeater.prototype.next` has never been called).
- The repeater has stopped.
- The repeater has a non-empty buffer.
- The promise returned from the previous push call has not been awaited and its `then/catch` methods have not been called.

##### Parameters
- `error` - The error to send to the repeater.
##### Return value
A promise which fulfills to the next iteration result if the repeater handles the `error`, and otherwise rejects with the given `error`.

## The `RepeaterBuffer` interface
The `Repeater` constructor optionally takes a `RepeaterBuffer` object as its second argument. Buffers allow multiple values to be pushed onto a repeater without having pushes wait.

```ts
export interface RepeaterBuffer {
  full: boolean;
  empty: boolean;
  add(value: unknown): void;
  remove(): unknown;
}
```

## The `FixedBuffer` class
```ts
class FixedBuffer implements RepeaterBuffer {
  constructor(capacity: number);
}
```

The `FixedBuffer` object allows repeaters to push a set number of values without having pushes wait or throw errors. When the limit is reached, the repeater behaves as it would without a buffer.

### constructor
##### parameters
- `capacity` - The maximum number of values that can be added to buffer.

## The `SlidingBuffer` class
```ts
class SlidingBuffer implements RepeaterBuffer {
  constructor(capacity: number);
}
```

The `SlidingBuffer` object allows repeaters to push unlimited values without having pushes wait or throw errors. When the buffer reaches the specified capacity, the buffer drops the *earliest* values passed to the buffer.

### constructor
##### parameters
- `capacity` - The maximum number of values that can be added to the buffer before the buffer drops values.

## The `DroppingBuffer` class
```ts
class DroppingBuffer implements RepeaterBuffer {
  constructor(capacity: number);
}
```

The `DroppingBuffer` object allows repeaters to push unlimited values without having pushes wait or throw errors. When the buffer reaches the specified capacity, the buffer drops the *latest* values passed to the buffer.

### constructor
##### parameters
- `capacity` - The maximum number of values that can be added to the buffer before the buffer drops values.
 
## `Repeater.race`
```ts
Repeater.race = function(
  contenders: Iterable<AsyncIterable<T> | Iterable<T> | PromiseLike<any>>,
): Repeater<T>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises. Promises are treated as an async iterable which returns the promise’s value when the promise settles.

##### Return value
A repeater which yields the fastest resolving value from each iterable for each iteration. If any iterables finishes, the repeater returns with that iterable’s final value.

## `Repeater.merge`
```ts
Repeater.merge = function(
  contenders: Iterable<AsyncIterable<T> | Iterable<T> | PromiseLike<any>>,
): Repeater<T>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises. Promises are treated as an async iterable which returns the promise’s value when the promise settles.

##### Return value
A repeater which yields values from each iterable as they resolve. When all iterables finish, the repeater returns with the final value of the last iterator which finished.

## `Repeater.zip`
```ts
Repeater.zip = function(
  contenders: Iterable<AsyncIterable<T> | Iterable<T> | PromiseLike<any>>,
): Repeater<T[]>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises. Promises are treated as an async iterable which returns the promise’s value when the promise settles.
##### Return value
A repeater which yields a tuple of values taken from each iterable for each iteration. When any iterable finishes, the repeater returns a tuple of the final values from each iterator.

## `Repeater.latest`

```ts
Repeater.latest = function(
  contenders: Iterable<AsyncIterable<T> | Iterable<T> | PromiseLike<any>>,
): Repeater<T[]>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises. Promises are treated as an async iterable which returns the promise’s value when the promise settles.
##### Return value
A repeater which yields a tuple of values taken from each iterable. The repeater yields the tuple of values whenever any of the `contenders` yields values. The repeater does not yield a value until every iterable has yielded a value at least once. When any iterable finishes, the repeater returns a tuple of the final values from each iterator.

## `RepeaterOverflowError`
```ts
class RepeaterOverflowError extends Error {
  constructor(message: string);
}
```

A `RepeaterOverflowError` is thrown when the `push` function or `next` method is called on a repeater with too many pending push or next operations.

### constructor
##### parameters
- `message` - A human-readable description of the error.

## `MAX_QUEUE_LENGTH`
```ts
const MAX_QUEUE_LENGTH = 1024;
```

A constant which represents the maximum number of pending push or next operations which can be enqueued on a single repeater.
