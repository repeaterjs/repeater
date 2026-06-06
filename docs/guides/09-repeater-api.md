---
id: "repeater"
title: "@repeaterjs/repeater"
---

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
Repeater.race = function <T>(
  contenders: Iterable<T>,
): Repeater<
  T extends AsyncIterable<infer U> | Iterable<infer U>
    ? U extends PromiseLike<infer V>
      ? V
      : U
    : never
>;
```

##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises.

##### Return value
A repeater which yields the first settling value from each iterable for each iteration. If any iterables finishes, the repeater returns with that iterable’s final value. Promises are treated as an async iterator which returns the value when the promise fulfills.

## `Repeater.merge`
```ts
Repeater.merge = function <T>(
  contenders: Iterable<T>,
): Repeater<
  T extends AsyncIterable<infer U> | Iterable<infer U>
    ? U extends PromiseLike<infer V>
      ? V
      : U
    : T extends PromiseLike<infer U>
    ? U
    : T
>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises.

##### Return value
A repeater which yields values from each iterable as they settle. When all iterables finish, the repeater returns with the final value of the last iterator which finished. Promises are treated as an async iterator which yields the value when the promise fulfills.

## `Repeater.zip`
```ts
type Contender<T>
  = AsyncIterable<Promise<T> | T>
  | Iterable<Promise<T> | T>
  | PromiseLike<T>
  | T;

Repeater.zip = function <T>(
  contenders: Iterable<Contender<T>>,
): Repeater<T[]>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises.
##### Return value
A repeater which yields a tuple of values taken from each iterable for each iteration. When any iterable finishes, the repeater returns a tuple of values from each iterator. Promises are treated as an async iterator which returns the value when the promise fulfills.

## `Repeater.latest`

```ts
type Contender<T>
  = AsyncIterable<Promise<T> | T>
  | Iterable<Promise<T> | T>
  | PromiseLike<T>
  | T;

Repeater.latest = function <T>(
  contenders: Iterable<Contender<T>>,
): Repeater<T[]>;
```
##### Parameters
- `contenders` - An iterable of async iterables, iterables or promises.
##### Return value
A repeater which yields a tuple of values taken from each iterable. The repeater yields a tuple of values whenever any of the `contenders` yields values. The repeater does not yield a value until every iterable has yielded a value at least once. When any iterable finishes, the repeater returns a tuple of the final values from each iterator. Promises are treated as an async iterator which both yields and returns the value when the promise fulfills.

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
