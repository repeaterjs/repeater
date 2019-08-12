import {
  CannotReadFromEmptyBufferError,
  CannotWriteToFullBufferError,
  CouldntGetChannelControllerInstanceError,
  InvalidBufferCapacityError
} from "../index";

describe("errors", () => {
  test("CannotWriteToFullBufferError", () => {
    const err = new CannotWriteToFullBufferError(123);

    expect(err).toBeInstanceOf(Error);

    expect(err.message).toBe("Cannot write to the full buffer!");

    expect(err.bufferSize).toBe(123);
    expect(err.name).toBe("CannotWriteToFullBufferError");
  });

  test("CannotReadFromEmptyBufferError", () => {
    const err = new CannotReadFromEmptyBufferError();

    expect(err).toBeInstanceOf(Error);

    expect(err.message).toBe("Cannot read from the full buffer!");

    expect(err.name).toBe("CannotReadFromEmptyBufferError");
  });

  test("CouldntGetChannelControllerInstanceError", () => {
    const err = new CouldntGetChannelControllerInstanceError();

    expect(err).toBeInstanceOf(Error);

    expect(err.message).toBe(
      "This channel does not seem to have assosiated ChannelController with it!"
    );

    expect(err.name).toBe("CouldntGetChannelControllerInstanceError");
  });

  test("InvalidBufferCapacityError", () => {
    const err = new InvalidBufferCapacityError(12345);

    expect(err).toBeInstanceOf(Error);

    expect(err.message).toBe(
      "Buffers capacity cannot be lesser than 0. Received: 12345!"
    );

    expect(err.providedCapacity).toBe(12345);
    expect(err.name).toBe("InvalidBufferCapacityError");
  });
});
