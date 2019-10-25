# Changelog
## repeater@3.0.0 - Unreleased
### Changed
This release of repeaters overhauls the `push` and `stop` promises and the `return` and `throw` methods to be more in line with the behavior of async generators. If you used repeaters to simply add and remove event handlers, you can upgrade without worrying about breaking changes. However, if you awaited `push` calls, used the value of the `stop` promise, or used the `return` or `throw` methods in non-trivial ways, this release may break your code.

- Previously, the n-th call to `push` resolved to the value passed to the n-th call to `Repeater.prototype.next`. This was inaccurate insofar as async generators resume the n-th `yield` with the value passed to the n+1-th call to `next`. Additionally, async generators will completely ignore the first value passed to `next` entirely. The former behavior was confusing insofar as you could not `push` a value until `next` was called for the first time anyways, so the first call to `push` would always resolve immediately. In 3.0, the behavior has now been changed so that the n-th call to `push` resolves to the n+1-th call to `next`.

For the most part, code which awaits `push` will work as expected, except when the code relied on the first call to `push` resolving immediately. The way this refactoring manifests itself is that any time you await push in a loop, you should make sure that you await push at the bottom of the loop, rather than the top. [See the changes to `timers`](https://github.com/repeaterjs/repeater/pull/37/files#diff-3a96d0916b4599004af38c4a0cedb249L94-R113) as an example.

- Calling `Repeater.prototype.throw` will now cause the previous `push` promise to reject, rather than uniformly stopping the repeater and throwing the error. This means errors can be thrown into repeaters and the repeater can recover from those errors. The original stopping and throwing behavior is preserved in the case where `push` calls are unhandled. If you await `push` or otherwise call the `then` or `catch` methods, it becomes your responsibility to handle the error and stop the repeater. [#43](https://github.com/repeaterjs/repeater/pull/43)

- The `stop` promise no longer resolves to the value passed to `Repeater.prototype.return`. Instead, it consistently resolves to `undefined` when the repeater is stopped. Additionally, calling `Repeater.prototype.return` will return an iterator result whose value is always whatever was passed to `return`. In the case of premature returns, the return value of the executor is ignored unless there is an error. [#41](https://github.com/repeaterjs/repeater/pull/41)

This change was made because there is no way with async generators to inspect the value passed to return from within the async generator. Additionally, the only way to modify the result returned from `return` would be to put a `return` statement in a `finally` block, which is a bad practice. Repeaters now uniformly return the value passed to the `return` method.

- Changes to typescript typings:
  - `Repeater`, `RepeaterExecutor`, `Push` and other related types now take the type parameters `TReturn` and `TNext` in line with typescript 3.6’s strict async generator typings.
  - The `RepeaterBuffer` interface and concrete classes no longer accept a type parameter. All places where the type parameter would have been used, `unknown` is used instead. You should never add or remove values from repeater buffers directly.
  - The typings of the `next` and `return` method have been changed to accept `PromiseLike<T>` and `PromiseLike<TReturn>` as their parameters.

## pubsub@0.3.2 - 2019-10-13
- Fixed build error in @repeaterjs/pubsub

## timers@0.3.1 - 2019-06-29
## limiters@0.3.1 - 2019-06-29
## pubsub@0.3.1 - 2019-06-29
### Fixed
- Fixed timers using the wrong version of @repeaterjs/repeater
- Fixed limiters using the wrong version of @repeaterjs/repeater
- Fixed pubsub using the wrong version of @repeaterjs/repeater

## timers@0.3.0 - 2019-08-24
## limiters@0.3.0 - 2019-08-24
## pubsub@0.3.0 - 2019-08-24
## repeater@2.0.0 - 2019-08-24
### Changed
- Renamed all instances of `Channel` to `Repeater` e.g. `Channel` to `Repeater`, `ChannelBuffer` to `RepeaterBuffer`

## timers@0.2.1 - 2019-06-09
## limiters@0.2.1 - 2019-06-09
## pubsub@0.2.1 - 2019-06-09
### Fixed
- Fixed timers using the wrong version of @channel/channel
- Fixed limiters using the wrong version of @channel/channel 
- Fixed pubsub using the wrong version of @channel/channel

## channel@1.0.0 - 2019-06-09
### Added
- The `Channel` class now exposes the static methods `Channel.race`, `Channel.merge`, `Channel.zip` and `Channel.latest` (#4).
### Changed
- `close` and `stop` arguments passed to executor are merged as the second argument.
- `stop` resolves to argument passed to `return` if `return` is called.
- `push` function now resolves to the value passed to next
- `push` function now unwraps promise-like values passed to push
- Buffers now throw an error is `remove` is called when the buffer is empty.
- Channel properties and methods which don’t belong to the async iterator interface are now hidden using a private WeakMap.
- Channels stop immediately when the executor throws an error.
- Executor now runs synchronously when `next` is called for the first time (#10).
- The final iteration result/errors are now consumed by iterator methods.
- `return`/`throw` behave more like the methods do for `async generators`.

## timers@0.2.0 - 2019-06-09
### Changed
- `delay` now returns an channel which can be reused
- `timeout` returns a channel

## limiters@0.2.0 - 2019-06-09
### Added
- throttler can now be passed a `cooldown` boolean option which forces the channel to wait before yielding the final token.
### Changed
- semaphore and throttler now both return channels rather than async iterators.
- throttler function now takes options instead of a number representing limit as the second arg.
- semaphore and throttler will throw a RangeError if limit is less than 1
### Fixed
- throttler now uses a sliding window to limit (#1).

## pubsub@0.2.0 - 2019-06-09
### Changed
- type definitions have changed slightly

## channel@0.1.1 - 2019-05-06
### Added
- Adds throw method to channels.
## timers@0.1.1 - 2019-04-08
## limiters@0.1.1 - 2019-04-08
## pubsub@0.1.1 - 2019-04-08

## channel@0.1.0 - 2019-04-08
- Initial release.
## timers@0.1.0 - 2019-04-08
- Initial release.
## limiters@0.1.0 - 2019-04-08
- Initial release.
## pubsub@0.1.0 - 2019-04-08
- Initial release.
