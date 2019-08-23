# @repeaterjs/repeater
The missing constructor for creating safe async iterators

For more information, visit [repeater.js.org](https://repeater.js.org).

## API

```ts
class Repeater<T> implements AsyncIterableIterator<T> {
  constructor(executor: RepeaterExecutor<T>, buffer?: RepeaterBuffer<T>);
  next(value?: any): Promise<IteratorResult<T>>;
  return(value?: any): Promise<IteratorResult<T>>;
  throw(error: any): Promise<IteratorResult<T>>;
  [Symbol.asyncIterator](): this;
}
```

The `Repeater` class implements the `AsyncIterableIterator` interface. Repeaters are designed to be indistinguishable from async generator objects.

```ts
type Push<T> = (value: PromiseLike<T> | T) => Promise<any | void>;

interface Stop extends Promise<any | void> {
  (error?: any): void;
}

type RepeaterExecutor<T> = (
  push: Push<T>,
  stop: Stop
) => Promise<T | void> | T | void;
```

The `RepeaterExecutor` is passed the arguments `push` and `stop`.

`push` is a function which allows you to enqueue values onto the repeater. It synchronously throws an error if there are too many pending pushes on the repeater (currently set to 1024). It returns a promise which resolves when it’s safe to push more values.

`stop` is a both a promise and a function. As a function, `stop` can be called to stop a repeater. Calling `stop` without any arguments stops the repeater without error, and passing an error both stops the repeater and causes the final iteration to reject with that error.

As a promise, `stop` can be awaited to defer event handler cleanup, and it can also be used with `Promise.race` to abort pending promises. If you pass a value to `Repeater.prototype.return`, `stop` will resolve to that value.

The value of the final interation of the repeater will be the return value of the executor. If the executor throws an error or returns a promise rejection, the repeater will be immediately stopped and the final iteration will throw.

```ts
interface RepeaterBuffer<T> {
  full: boolean;
  empty: boolean;
  add(value: T): void;
  remove(): T | undefined;
}

class FixedBuffer<T> implements RepeaterBuffer<T> {
  constructor(capacity: number);
}

class SlidingBuffer<T> implements RepeaterBuffer<T> {
  constructor(capacity: number);
}

class DroppingBuffer<T> implements RepeaterBuffer<T> {
  constructor(capacity: number);
}
```

The `Repeater` constructor optionally takes a `RepeaterBuffer` instance as its second argument. Buffers allow multiple values to be pushed onto repeaters without waiting. `FixedBuffer` allows repeaters to push a set number of values, `DroppingBuffer` drops the *latest* values when the buffer has reached capacity, and `SlidingBuffer` drops the *earliest* values when the buffer has reached capacity. You can define custom buffering behaviors by implementing the `RepeaterBuffer` interface.
