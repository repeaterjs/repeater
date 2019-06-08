---
id: utilities
title: Additional Channel-Based Utilities
---

In addition to the `@channel/channel` package, the [channel repository](https://github.com/channeljs/channel) and [package scope](https://www.npmjs.com/org/channel)  also contains various async utilities implemented with channels.

- `@channel/timers` - Cancelable timers using `setTimeout` and `setInterval`
- `@channel/limiters` - Async semaphores and throttlers for limiting concurrency
- `@channel/pubsub` - A generic pubsub class

These packages are experimental and will probably be changed more frequently than the base `@channel/channel` package, which is more or less stable. If you need greater stability, you are encouraged to copy the code from these packages directly into your codebase. Report back on what works and what doesn’t! Hopefully, the channel monorepo and `@channel` scope become a place for useful, channel-based async utilities discovered by the community.
