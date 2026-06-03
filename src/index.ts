export {
  RepeaterOverflowError,
  FixedBuffer,
  SlidingBuffer,
  DroppingBuffer,
  MAX_QUEUE_LENGTH,
} from "./core.js";
export type {
  RepeaterBuffer,
  Push,
  Stop,
  RepeaterExecutor,
} from "./core.js";

export { race, merge, zip, latest } from "./combinators.js";

import { Repeater as RepeaterCore } from "./core.js";
import { race, merge, zip, latest } from "./combinators.js";

export class Repeater<T, TReturn = any, TNext = unknown> extends RepeaterCore<T, TReturn, TNext> {
  static race = race;
  static merge = merge;
  static zip = zip;
  static latest = latest;
}
