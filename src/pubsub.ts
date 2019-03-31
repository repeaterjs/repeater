export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string): Promise<AsyncIterableIterator<T>>;
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

  subscribe(topic: string): Promise<AsyncIterableIterator<T>> {
    const channels = this.channels[topic] || new Set();
    const channel: Channel<T> = new Channel((put) =>
      this.puts.set(channel, put),
    );
    channels.add(channel);
    channel.onclose = () => channels.delete(channel);
    this.channels[topic] = channels;
    return Promise.resolve(channel);
  }
}
