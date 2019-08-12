import { CustomError } from "ts-custom-error";

export class CannotWriteToFullBufferError extends CustomError {
  constructor(public readonly bufferSize: number) {
    super("Cannot write to the full buffer!");
  }
}

export class CannotReadFromEmptyBufferError extends CustomError {
  constructor() {
    super("Cannot read from the full buffer!");
  }
}

export class CouldntGetChannelControllerInstanceError extends CustomError {
  constructor() {
    super(
      "This channel does not seem to have assosiated ChannelController with it!",
    );
  }
}

export class InvalidBufferCapacityError extends CustomError {
  constructor(public readonly providedCapacity: number) {
    super(
      `Buffers capacity cannot be lesser than 0. Received: ${providedCapacity}!`,
    );
  }
}
