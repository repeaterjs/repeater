export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string, value?: T): Promise<AsyncIterableIterator<T>>;
}

import { Channel } from "./channel";
export class InMemoryPubSub<T> implements PubSub<T> {
  protected channels: Record<string, Set<Channel<T>>> = {};
  protected puts: WeakMap<
    Channel<T>,
    (value: T) => Promise<void>
  > = new WeakMap();

  publish(topic: string, value: T): Promise<void> {
    const channels = this.channels[topic];
    if (channels != null) {
      for (const channel of channels) {
        const put = this.puts.get(channel);
        if (put == null) {
          channel.close();
          continue;
        }
        try {
          put(value);
        } catch (err) {
          channel.close();
        }
      }
    }
    return Promise.resolve();
  }

  subscribe(topic: string, value?: T): Promise<AsyncIterableIterator<T>> {
    const channels = this.channels[topic] || new Set();
    let put: (value: T) => Promise<void>;
    const channel: Channel<T> = new Channel((put1) => (put = put1));
    channels.add(channel);
    this.puts.set(channel, put!);
    if (value != null) {
      put!(value);
    }
    channel.onclose = () => channels.delete(channel);
    this.channels[topic] = channels;
    return Promise.resolve(channel);
  }
}
