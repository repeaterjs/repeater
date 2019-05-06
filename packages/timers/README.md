# @channel/timers
This package is experimental!

Cancelable timers, implemented with channels

```ts
function delay(wait: number, options?: { reject?: boolean; }): Channel<number>;
```

`delay` returns an async iterator which resolves after `wait` with the current timestamp and closes. The timer does not start until you call `next` on the returned iterator. The timer will reject with a `TimeoutError` if you pass `reject: true` to `options`. The timer can be canceled by calling `return`.

```ts
function timeout(wait: number): Promise<void>;
function timeout<T>(wait: number, promise: Promise<T>): Promise<T>;
```

`timeout` races a delay timer against the passed in promise. The returned promise will resolve to the original promise if the promise settles first and will reject with a `TimeoutError` if the timer wins. Calling `timeout` without a promise will always result in a `TimeoutError` rejection. The timer is automatically canceled if the passed in promise wins.

```ts
function interval(wait: number, buffer?: ChannelBuffer<number>): Channel<number>;
```
`interval` returns an async iterator which resolves with the current timestamp every `wait` milliseconds. The timer does not start until you call `next` on the returned iterator, and can be canceled by calling `return`.
