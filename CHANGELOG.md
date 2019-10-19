# Changelog
## [repeater@3.0.0] - Unreleased
### Changed
- Rather than having the first call to `push` resolve the first time `next` is called, the second call resolve to the second time `next` is called, etc., the first call now resolves the second time `next` is called, the second call resolves the third time `next` is called. [#37]
- The `stop` promise no longer resolves to the value passed to `Repeater.prototype.return`. Instead, it consistently resolves to `undefined` when the repeater is stopped. [#41]
- Calling `Repeater.prototype.return` will return an iterator result whose value is always whatever was passed to `return`. The return value of the executor will be ignored. [#41]
- The `Repeater.prototype.return` method types now accepts a promise-like as an argument.
- Calling `Repeater.prototype.throw` will now cause the previous `push` promise to reject, rather than uniformly stopping the repeater and throwing the error.
- `Repeater`, `RepeaterExecutor` and related types now take the type parameters `TReturn` and `TNext` in line with typescript 3.6’s strict async generator typings.

## [pubsub@0.3.2] - 2019-10-13
- Fixed build error in @repeaterjs/pubsub

## [timers@0.3.1] - 2019-06-29
## [limiters@0.3.1] - 2019-06-29
## [pubsub@0.3.1] - 2019-06-29
### Fixed
- Fixed timers using the wrong version of @repeaterjs/repeater
- Fixed limiters using the wrong version of @repeaterjs/repeater
- Fixed pubsub using the wrong version of @repeaterjs/repeater

## [timers@0.3.0] - 2019-08-24
## [limiters@0.3.0] - 2019-08-24
## [pubsub@0.3.0] - 2019-08-24
## [repeater@2.0.0] - 2019-08-24
### Changed
- Renamed all instances of `Channel` to `Repeater` e.g. `Channel` to `Repeater`, `ChannelBuffer` to `RepeaterBuffer`

## [timers@0.2.1] - 2019-06-09
## [limiters@0.2.1] - 2019-06-09
## [pubsub@0.2.1] - 2019-06-09
### Fixed
- Fixed timers using the wrong version of @channel/channel
- Fixed limiters using the wrong version of @channel/channel 
- Fixed pubsub using the wrong version of @channel/channel

## [channel@1.0.0] - 2019-06-09
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

## [timers@0.2.0] - 2019-06-09
### Changed
- `delay` now returns an channel which can be reused
- `timeout` returns a channel

## [limiters@0.2.0] - 2019-06-09
### Added
- throttler can now be passed a `cooldown` boolean option which forces the channel to wait before yielding the final token.
### Changed
- semaphore and throttler now both return channels rather than async iterators.
- throttler function now takes options instead of a number representing limit as the second arg.
- semaphore and throttler will throw a RangeError if limit is less than 1
### Fixed
- throttler now uses a sliding window to limit (#1).

## [pubsub@0.2.0] - 2019-06-09
### Changed
- type definitions have changed slightly

## [channel@0.1.1] - 2019-05-06
### Added
- Adds throw method to channels.
## [timers@0.1.1] - 2019-04-08
## [limiters@0.1.1] - 2019-04-08
## [pubsub@0.1.1] - 2019-04-08

## [channel@0.1.0] - 2019-04-08
- Initial release.
## [timers@0.1.0] - 2019-04-08
- Initial release.
## [limiters@0.1.0] - 2019-04-08
- Initial release.
## [pubsub@0.1.0] - 2019-04-08
- Initial release.

[timers@0.2.1]: https://github.com/channeljs/channel/compare/@channel/timers@0.2.0...@channel/timers@0.2.1
[limiters@0.2.1]: https://github.com/channeljs/channel/compare/@channel/limiters@0.2.0...@channel/limiters@0.2.1
[pubsub@0.2.1]: https://github.com/channeljs/channel/compare/@channel/pubsub@0.2.0...@channel/pubsub@0.2.1
[channel@1.0.0]: https://github.com/channeljs/channel/compare/@channel/channel@0.1.0...@channel/channel@1.0.0
[timers@0.2.0]: https://github.com/channeljs/channel/compare/@channel/timers@0.1.1...@channel/timers@0.2.0
[limiters@0.2.0]: https://github.com/channeljs/channel/compare/@channel/limiters@0.1.1...@channel/limiters@0.2.0
[pubsub@0.2.0]: https://github.com/channeljs/channel/compare/@channel/pubsub@0.1.1...@channel/pubsub@0.2.0
[channel@0.1.1]: https://github.com/channeljs/channel/compare/@channel/channel@0.1.0...@channel/channel@0.1.1
[timers@0.1.1]: https://github.com/channeljs/channel/compare/@channel/timers@0.1.0...@channel/timers@0.1.1
[limiters@0.1.1]: https://github.com/channeljs/channel/compare/@channel/limiters@0.1.0...@channel/limiters@0.1.1
[pubsub@0.1.1]: https://github.com/channeljs/channel/compare/@channel/pubsub@0.1.0...@channel/pubsub@0.1.1
[channel@0.1.0]: https://github.com/channeljs/channel/releases/tag/@channel/channel@0.1.0
[timers@0.1.0]: https://github.com/channeljs/channel/releases/tag/@channel/timers@0.1.0
[limiters@0.1.0]: https://github.com/channeljs/channel/releases/tag/@channel/limiters@0.1.0
[pubsub@0.1.0]: https://github.com/channeljs/channel/releases/tag/@channel/pubsub@0.1.0
