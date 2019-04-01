import { SlidingBuffer } from "./buffers";
import { Channel } from "./channel";

export function timeout(
  delay: number,
  options: { reject?: boolean } = {},
): Channel<number> {
  let timer: any;
  const chan: Channel<number> = new Channel((put, close) => {
    timer = setTimeout(async () => {
      if (options.reject) {
        close(new Error(`${delay} ms elapsed`));
      } else {
        await put(Date.now());
        close();
      }
    }, delay);
  });
  chan.onclose = () => clearTimeout(timer);
  return chan;
}

export function interval(delay: number): Channel<number> {
  let timer: any;
  const chan: Channel<number> = new Channel((put) => {
    timer = setInterval(() => put(Date.now()), delay);
  }, new SlidingBuffer(1));
  chan.onclose = () => {
    clearInterval(timer);
  };
  return chan;
}
