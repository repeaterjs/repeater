# @channel/channel
The missing constructor for creating safe async iterators

## API

```ts
export declare class Channel<T = any, TYield = T, TReturn = TYield>
  implements AsyncIterableIterator<T> {
  constructor(
    executor: ChannelExecutor<T, TYield, TReturn>,
    buffer?: ChannelBuffer<T>,
  );
  next(value?: TYield): Promise<IteratorResult<T>>;
  return(value?: TReturn): Promise<IteratorResult<T>>;
  throw(error?: any): Promise<IteratorResult<T>>;
  [Symbol.asyncIterator](): this;
}
```

The `Channel` class implements the `AsyncIterableIterator` interface. Channels are virtually indistinguishable from async generator objects.

```ts
type ChannelExecutor<T, TYield, TReturn> = (
  push: (value: T) => Promise<TYield | void>,
  close: (error?: any) => void,
  stop: Promise<TReturn | void>,
) => Promise<T | void> | T | void;
```

The `ChannelExecutor` is passed three values: `push`, `close` and `stop`.

`push` is a function which allows you to enqueue values onto the channel. It synchronously throws errors if there are too many pending pushes on the channel (currently set to 1024). It returns a promise which resolves when it’s safe to push more values. If you pass a value to `Channel.prototype.next`, the oldest pending push call will resolve to that value.

`close` is a function which allows you to close the channel. Passing zero arguments to `close` closes the channel without error, while passing an error both closes the channel and causes the final iteration to reject with that error. Calling `close` on an already closed channel has no effect.

`stop` is a promise which resolves when the channel is closed. It is useful to await `stop` to delay removing event handlers, and it can be used with `Promise.race` to cancel promises within the executor. If you pass a value to `Channel.prototype.return`, `stop` will resolve to that value.

The channel will automatically close when the executor returns, so it is advisable to make the executor asynchronous and await the `stop` promise to ensure the channel does not close prematurely.

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

The `Channel` constructor optionally takes a `ChannelBuffer` instance as its second argument. Buffers allow multiple values to be pushed onto channels without waiting. `FixedBuffer` allows channels to push a set number of values, `DroppingBuffer` drops the *latest* values when the buffer has reached capacity, and `SlidingBuffer` drops the *earliest* values when the buffer has reached capacity. You can define custom buffering behaviors by implementing the `ChannelBuffer` interface.
