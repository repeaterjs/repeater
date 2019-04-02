export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string, value?: T): Promise<AsyncIterableIterator<T>>;
}

import { Channel } from "./channel";

interface Publisher<T> {
  put(value: T): void;
  close(err: any): void;
}

export class InMemoryPubSub<T> implements PubSub<T> {
  protected publishers: Record<string, Set<Publisher<T>>> = {};

  publish(topic: string, value: T): Promise<void> {
    const publishers = this.publishers[topic];
    if (publishers != null) {
      for (const { put, close } of publishers) {
        try {
          put(value);
        } catch (err) {
          // put queue is full or weakmap lost reference to put function
          close(err);
        }
      }
    }
    return Promise.resolve();
  }

  subscribe(topic: string, value?: T): Promise<AsyncIterableIterator<T>> {
    if (this.publishers[topic] == null) {
      this.publishers[topic] = new Set();
    }
    const chan: Channel<T> = new Channel(async (put, close, start, stop) => {
      if (value != null) {
        put(value);
      }
      await start;
      const publisher = { put, close };
      this.publishers[topic].add(publisher);
      await stop;
      this.publishers[topic].delete(publisher);
    });
    return Promise.resolve(chan);
  }
}
