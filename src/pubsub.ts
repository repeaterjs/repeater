import { Channel } from "./channel";

export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string): AsyncIterableIterator<T>;
  close(topic: string, reason?: any): void;
  destroy(reason?: any): void;
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

  subscribe(topic: string): AsyncIterableIterator<T> {
    if (this.publishers[topic] == null) {
      this.publishers[topic] = new Set();
    }
    return new Channel<T>(async (push, close, _start, stop) => {
      // awaiting start can cause unnecessary deadlocks or dropped values
      const publisher = { push, close };
      this.publishers[topic].add(publisher);
      await stop;
      this.publishers[topic].delete(publisher);
    });
  }

  close(topic: string, reason?: any): void {
    const publishers = this.publishers[topic];
    if (publishers == null) {
      return;
    }
    for (const { close } of publishers) {
      close(reason);
    }
  }

  destroy(reason?: any): void {
    for (const publishers of Object.values(this.publishers)) {
      for (const { close } of publishers) {
        close(reason);
      }
    }
  }
}
