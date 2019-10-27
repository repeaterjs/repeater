---
id: repeater_api
title: "@repeaterjs/repeater"
---

## The `Repeater` class
```ts
class Repeater<T, TReturn = any, TNext = unknown> {
  constructor(
    executor: RepeaterExecutor<T, TReturn, TNext>,
    buffer?: RepeaterBuffer,
  );
}
```

The `Repeater` object represents an asynchronous sequence of values. The `Repeater` class implements the `AsyncIterableIterator` interface and can be consumed using a `for…await of` loop or by calling the `next`, `return` and `throw` methods directly.

The type parameters `T`, `TReturn` and `TNext` correspond to the type parameters passed to the `AsyncIterator` interface provided by the built-in TypeScript library.

### Constructor 

##### Parameters
- `executor` - A callback which is called when the repeater is started.
- `buffer` - An optional buffer object which allows the repeater to store or drop values.

#### The `executor` callback
```ts
type RepeaterExecutor<T, TReturn = any, TNext = any> = (
  push: Push<T, TNext>,
  stop: Stop,
) => PromiseLike<TReturn> | TReturn;
```

The `executor` passed to the repeater is called with the arguments `push` and `stop`, two functions which can be used to manipulate the state of the repeater. If the `executor` throws an error, the repeater will be automatically stopped and the final iteration will reject with the error. If the executor returns normally, the return value of the executor will be used as the final value of the repeater. The `executor` is usually an async function.

#### The `push` argument 
```ts
type Push<T, TNext = unknown> = (
  value: PromiseLike<T> | T,
) => Promise<TNext | undefined>;
```

##### Parameters
- `value` - the value to pass to repeater consumers.

The `push` argument is a function which can be called with a value to enqueue the value on the repeater. Consumers can then pull the pushed value using `Repeater.prototype.next`. If the value passed to `push` is a promise, the repeater will unwrap the promise before passing it to consumers.

The `push` function returns a promise which fulfills or rejects depending on the state of the repeater:

1. If the repeater is stopped, the returned promise will resolve to `undefined`.
2. If the repeater has a non-empty buffer, the returned promise will resolve to `undefined`.
3. `Repeater.prototype.next` will resolve the previous `push` call to the value passed to the `next` method. If the repeater is consumed using a `for await…of` loop, this value will be `undefined`.
4. If `Repeater.prototype.throw` is called, the previous `push` call will reject. If the caller of `push` awaits or otherwise handles the returned promise, it becomes the responsibility of the caller of `push` to handle the error. However, if the caller ignores the returned promise, the repeater will automatically detects this unhandled rejection and rethrow the error to the caller of `throw`.

The `push` function will synchronously throw an error if there are too many pending pushes on the repeater.

#### The `stop` argument
```ts
type Stop = ((error?: any) => undefined) & Promise<undefined>;
```

The `stop` argument is both a function and a promise.

As a function, `stop` can be called to stop the repeater, preventing any further values from being pushed. Calling `stop` without arguments stops the repeater without error, and passing an error both stops the repeater and causes the final iteration to reject with that error.
 
##### Parameters
- error: An optional error. If the error passed to `stop` is non-null and non-undefined, the final iteration will reject to the error.

As a promise, `stop` resolves when `stop` is called, when `Repeater.prototype.return` is called, when a promise rejection is passed to push, or when the executor errors. It can be awaited to defer event handler cleanup, and it can also be used with `Promise.race` to abort pending promises. The `stop` promise will always resolve to `undefined` and will never reject.

### `Repeater.prototype.next`
The `next` method returns an object with two properties `done` and `value`. You can also provide a parameter to the next method to send a value to the repeater.

```ts
class Repeater {
  next(value?: PromiseLike<TNext> | TNext): Promise<IteratorResult<T>>;
}
```

##### Parameters
- `value` - The value to send to the repeater. The previous `push` call will resolve to this value.

##### Return value
A promise which fulfills to an object with the following two properties:
- `done` - a boolean which indicates whether there are no more values to be pulled.
- `value`
  - If `done` is true, `value` is either be `undefined` or the return value of the `executor`.
  - If `done` is false the `value` is a value passed to `push`.

The `next` function will synchronously throw an error if there are too many pending calls to `next` on the repeater.

### `Repeater.protoype.return`
The `return` method returns the given value and finishes the repeater. Calling `return` will prematurely finish the repeater and cause any pending values to be dropped. Additionally, the `executor`’s return value will be ignored.

```ts
class Repeater {
  return(value?: PromiseLike<TReturn> | TReturn): Promise<IteratorResult<T>>;
}
```

##### Parameters
- `value` - The value to return. If the `value` is a promise, `return` will await the value before returning it.

##### Return value
A promise which fulfills to an object with following two properties:
- `done` - true
- `value` - the value passed to `return`.

### `Repeater.prototype.throw`
The `throw` method causes the previous `push` call to reject with the given error. If the executor fails to handle the `error`, the `throw` method will rethrow the error and finish the repeater.

```ts
class Repeater {
  throw(error?: any): Promise<IteratorResult<T>>;
}
```

##### Parameters
- `error` - The error to send to the repeater.

##### Return value
- A promise which fulfills to the next iteration result if the repeater handles the `error`, and otherwise rejects to the given `error`.
 
## The `RepeaterBuffer` interface

The `Repeater` constructor optionally takes a `RepeaterBuffer` instance as its second argument. Buffers allow multiple values to be pushed onto repeaters without having pushes wait.

```ts
export interface RepeaterBuffer {
  full: boolean;
  empty: boolean;
  add(value: unknown): void;
  remove(): unknown;
}
```

## The `FixedBuffer` class
The `FixedBuffer` object allows repeaters to push a set number of values.
```ts
class FixedBuffer implements RepeaterBuffer {
  constructor(capacity: number);
  readonly empty: boolean;
  readonly full: boolean;
  add(value: unknown): void;
  remove(): unknown;
}
```

## The `SlidingBuffer` class
The `SlidingBuffer` object drops the *earliest* values when the buffer has reached capacity.
```ts
class SlidingBuffer implements RepeaterBuffer {
  constructor(capacity: number);
  readonly empty: boolean;
  readonly full = false;
  add(value: unknown): void;
  remove(): unknown;
}
```

## The `DroppingBuffer` class
The `DroppingBuffer` object drops the *latest* values when the buffer has reached capacity. 
```ts
class DroppingBuffer implements RepeaterBuffer {
  constructor(capacity: number);
  readonly empty: boolean;
  readonly full = false;
  add(value: unknown): void;
  remove(): unknown;
}
```
