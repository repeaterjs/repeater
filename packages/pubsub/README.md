# @channel/pubusb
This package is experimental!

A generic pubsub class, implemented with channels

```ts
interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string, buffer: ChannelBuffer<T>): AsyncIterableIterator<T>;
  unpublish(topic: string, reason?: any): void;
  close(reason?: any): void;
}
```

```ts
class InMemoryPubSub<T> implements PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string, buffer?: ChannelBuffer<T>): Channel<T>;
  unpublish(topic: string, reason?: any): void;
  close(reason?: any): void;
}
```
