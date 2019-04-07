import { InMemoryPubSub } from "../index";

describe("pubsub", () => {
  test("close", () => {
    const pubsub = new InMemoryPubSub();
    pubsub.close();
  });
});
