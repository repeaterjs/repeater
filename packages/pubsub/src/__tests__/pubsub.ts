import { InMemoryPubSub } from "../pubsub";

describe("InMemoryPubSub", () => {
  test("subscribe", async () => {
    const pubsub = new InMemoryPubSub();
    const messages = (async () => {
      const messages = [];
      for await (const message of pubsub.subscribe("topic")) {
        messages.push(message);
        if (message === "c") {
          break;
        }
      }

      return messages;
    })();

    pubsub.publish("topic", "a");
    pubsub.publish("topic", "b");
    pubsub.publish("topic", "c");
    pubsub.publish("unrelated", "d");
    await expect(messages).resolves.toEqual(["a", "b", "c"]);
  });

  test("unpublish", async () => {
    const pubsub = new InMemoryPubSub();
    const messages = (async () => {
      const messages = [];
      for await (const message of pubsub.subscribe("topic")) {
        messages.push(message);
      }

      return messages;
    })();

    pubsub.publish("topic", "a");
    pubsub.publish("topic", "b");
    pubsub.publish("topic", "c");
    pubsub.publish("unrelated", "d");
    pubsub.unpublish("topic");
    await expect(messages).resolves.toEqual(["a", "b", "c"]);
  });

  test("close", () => {
    const pubsub = new InMemoryPubSub();
    pubsub.close();
    expect(1).toEqual(1);
  });
});
