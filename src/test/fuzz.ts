import { describe, test, expect } from "@b9g/libuild/test";
import fc from "fast-check";
import { race, merge, zip, latest } from "../combinators.js";

// Property-based ("fuzz") tests for the combinators, in the style of revise's
// test/edit-properties.ts. Instead of real timers we jitter each source with a
// random number of microtask ticks before every yield. That shuffles the
// interleaving between sources from run to run without making the suite slow or
// flaky, while exercising the same safeRace/stop machinery the combinators use.

interface Source {
  values: number[];
  ticks: number[];
  returnValue: number;
}

const arbSource: fc.Arbitrary<Source> = fc
  .array(
    fc.record({
      value: fc.integer({ min: 0, max: 50 }),
      tick: fc.integer({ min: 0, max: 3 }),
    }),
    { maxLength: 6 },
  )
  .chain((ops) =>
    fc.integer({ min: -100, max: -1 }).map((returnValue) => ({
      values: ops.map((o) => o.value),
      ticks: ops.map((o) => o.tick),
      returnValue,
    })),
  );

const arbSources = fc.array(arbSource, { minLength: 1, maxLength: 4 });

// Wrap an async iterable so we can observe whether return() was invoked. The
// flag flips synchronously on invocation, so it records that cleanup was
// requested even if the underlying generator is still draining.
function tracked(source: Source): {
  iterable: AsyncIterable<number>;
  state: { returned: boolean };
} {
  const state = { returned: false };
  const inner = (async function* () {
    for (let i = 0; i < source.values.length; i++) {
      for (let t = 0; t < source.ticks[i]; t++) {
        await Promise.resolve();
      }

      yield source.values[i];
    }

    return source.returnValue;
  })();

  const iterable: AsyncIterable<number> = {
    [Symbol.asyncIterator]() {
      return {
        next: (...args: [] | [unknown]) => inner.next(...(args as [])),
        return: (value?: any) => {
          state.returned = true;
          return inner.return(value);
        },
        throw: (err?: any) => inner.throw(err),
      };
    },
  };

  return { iterable, state };
}

const sortNums = (xs: number[]) => [...xs].sort((a, b) => a - b);

function isMultisetSubset(sub: number[], sup: number[]): boolean {
  const counts = new Map<number, number>();
  for (const x of sup) {
    counts.set(x, (counts.get(x) || 0) + 1);
  }

  for (const x of sub) {
    const n = counts.get(x) || 0;
    if (n === 0) {
      return false;
    }

    counts.set(x, n - 1);
  }

  return true;
}

describe("combinator fuzzing", () => {
  test("merge yields every value from every source exactly once", async () => {
    await fc.assert(
      fc.asyncProperty(arbSources, async (sources) => {
        const tracks = sources.map(tracked);
        const out: number[] = [];
        for await (const value of merge(tracks.map((t) => t.iterable))) {
          out.push(value);
        }

        expect(sortNums(out)).toEqual(sortNums(sources.flatMap((s) => s.values)));
        // Running to completion must dispose every source.
        expect(tracks.every((t) => t.state.returned)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  test("zip yields columns up to the shortest source", async () => {
    await fc.assert(
      fc.asyncProperty(arbSources, async (sources) => {
        const tracks = sources.map(tracked);
        const out: number[][] = [];
        for await (const row of zip(tracks.map((t) => t.iterable))) {
          out.push(row as number[]);
        }

        const minLen = Math.min(...sources.map((s) => s.values.length));
        expect(out.length).toBe(minLen);
        for (let i = 0; i < minLen; i++) {
          expect(out[i].length).toBe(sources.length);
          for (let j = 0; j < sources.length; j++) {
            expect(out[i][j]).toBe(sources[j].values[i]);
          }
        }

        expect(tracks.every((t) => t.state.returned)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  test("race over a single source yields its values in order", async () => {
    await fc.assert(
      fc.asyncProperty(arbSource, async (source) => {
        const { iterable } = tracked(source);
        const out: number[] = [];
        for await (const value of race([iterable])) {
          out.push(value);
        }

        expect(out).toEqual(source.values);
      }),
      { numRuns: 300 },
    );
  });

  test("race over many sources terminates and yields a sub-multiset", async () => {
    await fc.assert(
      fc.asyncProperty(arbSources, async (sources) => {
        const tracks = sources.map(tracked);
        const out: number[] = [];
        for await (const value of race(tracks.map((t) => t.iterable))) {
          out.push(value);
        }

        const union = sources.flatMap((s) => s.values);
        expect(isMultisetSubset(out, union)).toBe(true);
        expect(tracks.every((t) => t.state.returned)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  test("latest yields fixed-width rows and starts from the first values", async () => {
    await fc.assert(
      fc.asyncProperty(arbSources, async (sources) => {
        const tracks = sources.map(tracked);
        const out: number[][] = [];
        for await (const row of latest(tracks.map((t) => t.iterable))) {
          out.push(row as number[]);
        }

        for (const row of out) {
          expect(row.length).toBe(sources.length);
        }

        if (sources.every((s) => s.values.length > 0)) {
          expect(out[0]).toEqual(sources.map((s) => s.values[0]));
        }

        expect(tracks.every((t) => t.state.returned)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  test("breaking out of a combinator early disposes every source", async () => {
    const combinators = [merge, race, zip, latest] as Array<
      (contenders: Iterable<any>) => AsyncIterableIterator<any>
    >;
    await fc.assert(
      fc.asyncProperty(
        arbSources,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 3 }),
        async (sources, breakAfter, which) => {
          const tracks = sources.map(tracked);
          const combined = combinators[which](tracks.map((t) => t.iterable));
          let count = 0;
          for await (const _ of combined) {
            if (++count >= breakAfter) {
              break;
            }
          }

          expect(tracks.every((t) => t.state.returned)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});
