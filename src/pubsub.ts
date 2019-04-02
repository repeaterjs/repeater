import { Channel } from "./channel";

export interface PubSub<T> {
  publish(topic: string, value: T): Promise<void>;
  subscribe(topic: string): Promise<AsyncIterableIterator<T>>;
}

interface Publisher<T> {
  push(value: T): void;
  close(err: any): void;
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

  subscribe(topic: string): Promise<AsyncIterableIterator<T>> {
    if (this.publishers[topic] == null) {
      this.publishers[topic] = new Set();
    }
    return Promise.resolve(
      new Channel<T>(async (push, close, start, stop) => {
        await start;
        const publisher = { push, close };
        this.publishers[topic].add(publisher);
        await stop;
        this.publishers[topic].delete(publisher);
      }),
    );
  }
}
