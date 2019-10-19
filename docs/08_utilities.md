---
id: utilities
title: Additional Repeater-Based Utilities
---

In addition to the `@repeaterjs/repeater` package, the [repeater repository](https://github.com/repeaterjs/repeater) and [package scope](https://www.npmjs.com/org/repeater) contain various async utilities implemented with repeaters.

- [`@repeaterjs/timers`](https://github.com/repeaterjs/repeater/tree/master/packages/timers) - Cancelable timers using `setTimeout` and `setInterval`
- [`@repeaterjs/limiters`](https://github.com/repeaterjs/repeater/tree/master/packages/limiters) - Async semaphores and throttlers for limiting concurrency
- [`@repeaterjs/pubsub`](https://github.com/repeaterjs/repeater/tree/master/packages/pubsub) - A generic pubsub class
- [`@repeaterjs/react-hooks`](https://github.com/repeaterjs/react-hooks) - React hooks for working with async generators and repeaters

These packages are experimental and will probably be changed more frequently than the base `@repeaterjs/repeater` package, which is more or less stable. If you need greater stability, you are encouraged to copy the code from these packages directly into your codebase. Report back on what works and what doesn’t! Hopefully, the `repeaterjs` github organization and npm scope become a place for useful, repeater-based async utilities discovered by the community.
