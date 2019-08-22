import { Channel, ChannelBuffer } from "@repeaterjs/repeater";

export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void> | void;
  unpublish(topic: string, reason?: any): Promise<void> | void;
  subscribe(topic: string, buffer?: ChannelBuffer<T>): AsyncIterableIterator<T>;
  close(reason?: any): Promise<void> | void;
}

interface Publisher<T> {
  push(value: T): void;
  stop(reason?: any): void;
}

export class InMemoryPubSub<T> implements PubSub<T> {
  protected publishers: Record<string, Set<Publisher<T>>> = {};

  publish(topic: string, value: T): void {
    const publishers = this.publishers[topic];
    if (publishers != null) {
      for (const { push, stop } of publishers) {
        try {
          push(value);
        } catch (err) {
          // push queue is full
          stop(err);
        }
      }
    }
  }

  unpublish(topic: string, reason?: any): void {
    const publishers = this.publishers[topic];
    if (publishers == null) {
      return;
    }
    for (const { stop } of publishers) {
      stop(reason);
    }
    publishers.clear();
  }

  subscribe(topic: string, buffer?: ChannelBuffer<T>): Channel<T> {
    if (this.publishers[topic] == null) {
      this.publishers[topic] = new Set();
    }
    return new Channel<T>(async (push, stop) => {
      const publisher = { push, stop };
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
