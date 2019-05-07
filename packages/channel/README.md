# @channel/channel
The missing constructor for creating safe async iterators

## API

```ts
class Channel<T> implements AsyncIterableIterator<T> {
  constructor(executor: ChannelExecutor<T>, buffer?: ChannelBuffer<T>);
  next(): Promise<IteratorResult<T>>;
  return(): Promise<IteratorResult<T>>;
  throw(reason: any): Promise<IteratorResult<T>>;
  [Symbol.asyncIterator](): this;
}
```

The `Channel` class is a simple constructor which is passed an `ChannelExecutor` function and implements the `AsyncIterableIterator` interface.

```ts
type ChannelExecutor<T> = (
  push: (value: T) => Promise<boolean>,
  close: (reason?: any) => void,
  stop: Promise<void>
) => T | void | Promise<T | void>;
```

The `Channel` executor is passed three values, `push`, `close` and `stop`.

`push` is a function which allows you to `push` new values onto the channel. It returns a promise which resolves to true when the channel accepts the value or false if the channel is closed. It will synchronously throw an error if there are too many pending pushes on the channel.

`close` is a function which allows you to close the channel. Passing no arguments to close will cause the channel to close without error, while passing one argument will cause every subsequent call to `next` to reject with that argument. Calling `close` on an already closed channel will have no effect.

`stop` is a promise which resolves when the channel is closed. It is useful to await the `stop` promise before removing event handlers, and it can be used with `Promise.race` to cancel pending promises within the executor.

```ts
interface ChannelBuffer<T> {
  full: boolean;
  empty: boolean;
  add(value: T): void;
  remove(): T | undefined;
}

class FixedBuffer<T> implements ChannelBuffer<T> {
  constructor(capacity: number);
}

class SlidingBuffer<T> implements ChannelBuffer<T> {
  constructor(capacity: number);
}

class DroppingBuffer<T> implements ChannelBuffer<T> {
  constructor(capacity: number);
}
```

The `Channel` constructor optionally takes a `ChannelBuffer` instance as its second argument. Buffers allow multiple values to be pushed onto channels without waiting. `FixedBuffer` allows channels to push a set number of values, `DroppingBuffer` will drop the *latest* values when the buffer has reached capacity, and `SlidingBuffer` will drop the *earliest* values when the buffer has reached capacity. You can define custom buffering behaviors by implementing the `ChannelBuffer` interface.
