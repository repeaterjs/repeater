import { throttler, semaphore } from "../index";
describe("limiters", () => {
  test("semaphore", async () => {
    const tokens = semaphore(4);
    const t1 = (await tokens.next()).value;
    expect(t1.remaining).toEqual(3);
    const t2 = (await tokens.next()).value;
    expect(t2.remaining).toEqual(2);
    const t3 = (await tokens.next()).value;
    expect(t3.remaining).toEqual(1);
    const t4 = (await tokens.next()).value;
    expect(t4.remaining).toEqual(0);
    t1.release();
    t2.release();
    const t5 = (await tokens.next()).value;
    expect(t5.remaining).toEqual(1);
    t3.release();
    const t6 = (await tokens.next()).value;
    expect(t6.remaining).toEqual(1);
  });

  // TODO: figure out how to test throttler with timer mocks
  test.skip("throttler", async () => {
    let i = 0;
    for await (const token of throttler(1000, 8)) {
      token; // console.log(token);
      if (i++ >= 35) {
        break;
      }
    }
  });
});
