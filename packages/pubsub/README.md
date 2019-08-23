# @repeater/pubusb
This package is experimental!

A generic pubsub class, implemented with repeaters

For more information, visit [repeater.js.org](https://repeater.js.org).

```ts
interface PubSub<T> {
  publish(topic: string, value: T): Promise<void> | void;
  unpublish(topic: string, reason?: any): Promise<void> | void;
  subscribe(topic: string, buffer?: RepeaterBuffer<T>): AsyncIterableIterator<T>;
  close(reason?: any): Promise<void> | void;
}

class InMemoryPubSub<T> implements PubSub<T> {
  publish(topic: string, value: T): void;
  unpublish(topic: string, reason?: any): void;
  subscribe(topic: string, buffer?: RepeaterBuffer<T>): Repeater<T>;
  close(reason?: any): void;
}
```
