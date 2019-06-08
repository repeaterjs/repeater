# @channel/pubusb
This package is experimental!

A generic pubsub class, implemented with channels

```ts
interface PubSub<T> {
  publish(topic: string, value: T): Promise<void> | void;
  unpublish(topic: string, reason?: any): Promise<void> | void;
  subscribe(topic: string, buffer?: ChannelBuffer<T>): AsyncIterableIterator<T>;
  close(reason?: any): Promise<void> | void;
}

class InMemoryPubSub<T> implements PubSub<T> {
  publish(topic: string, value: T): void;
  unpublish(topic: string, reason?: any): void;
  subscribe(topic: string, buffer?: ChannelBuffer<T>): Channel<T>;
  close(reason?: any): void;
}
```
