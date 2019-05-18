import { Channel, ChannelBuffer } from "@channel/channel";

export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  unpublish(topic: string, reason?: any): void;
  subscribe(topic: string, buffer?: ChannelBuffer<T>): AsyncIterableIterator<T>;
  close(reason?: any): void;
}

interface Publisher<T> {
  push(value: T): void;
  close(reason?: any): void;
}

export class InMemoryPubSub<T> implements PubSub<T> {
  protected publishers: Record<string, Set<Publisher<T>>> = {};

  publish(topic: string, value: T): Promise<void> {
    const publishers = this.publishers[topic];
    if (publishers != null) {
      for (const { push, close } of publishers) {
        try {
          push(value);
        } catch (err) {
          // push queue is full
          close(err);
        }
      }
    }
    return Promise.resolve();
  }

  unpublish(topic: string, reason?: any): void {
    const publishers = this.publishers[topic];
    if (publishers == null) {
      return;
    }
    for (const { close } of publishers) {
      close(reason);
    }
    publishers.clear();
  }

  subscribe(topic: string, buffer?: ChannelBuffer<T>): Channel<T> {
    if (this.publishers[topic] == null) {
      this.publishers[topic] = new Set();
    }
    return new Channel<T>(async (push, close, stop) => {
      const publisher = { push, close };
      this.publishers[topic].add(publisher);
      await stop;
      this.publishers[topic].delete(publisher);
    }, buffer);
  }

  close(reason?: any): void {
    for (const topic of Object.keys(this.publishers)) {
      this.unpublish(topic, reason);
    }
  }
}
