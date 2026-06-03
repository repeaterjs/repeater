// Internal utilities shared with other bikeshaving packages (Crank, etc.).
// Kept dependency-free and intentionally aligned with crank's src/_utils.ts so
// the implementations can stay in sync across the umbrella.

export function isPromiseLike(value: any): value is PromiseLike<unknown> {
  return value != null && typeof value.then === "function";
}

export function isIteratorLike(
  value: any,
): value is Iterator<unknown> | AsyncIterator<unknown> {
  return value != null && typeof value.next === "function";
}

type Deferred<T = unknown> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type RaceRecord = {
  deferreds: Set<Deferred>;
  settled: boolean;
};

function createRaceRecord(contender: PromiseLike<unknown>): RaceRecord {
  const deferreds = new Set<Deferred>();
  const record = { deferreds, settled: false };

  // This call to `then` happens once for the lifetime of the value.
  Promise.resolve(contender).then(
    (value) => {
      for (const { resolve } of deferreds) {
        resolve(value);
      }

      deferreds.clear();
      record.settled = true;
    },
    (err) => {
      for (const { reject } of deferreds) {
        reject(err);
      }

      deferreds.clear();
      record.settled = true;
    },
  );
  return record;
}

// Promise.race is memory unsafe: losing contenders retain a reference to the
// race's resolution function for as long as they remain pending, so racing a
// short-lived promise against a long-lived one leaks the short-lived value.
// safeRace is a drop-in alternative which is not memory unsafe. See:
// https://github.com/nodejs/node/issues/17469#issuecomment-685235106
// Keys are the promise-like values passed to race. Values are a record holding
// the set of deferreds awaiting that value and whether it has settled.
const wm = new WeakMap<object, RaceRecord>();
export function safeRace<T>(
  contenders: Iterable<T | PromiseLike<T>>,
): Promise<Awaited<T>> {
  let deferred: Deferred;
  const result = new Promise((resolve, reject) => {
    deferred = { resolve, reject };
    for (const contender of contenders) {
      if (!isPromiseLike(contender)) {
        // If the contender is not a then-able, attempting to use it as a key in
        // the weakmap would throw. Luckily, it is safe to call
        // Promise.resolve(contender).then on regular values multiple times
        // because the promise fulfills immediately.
        Promise.resolve(contender).then(resolve, reject);
        continue;
      }

      let record = wm.get(contender);
      if (record === undefined) {
        record = createRaceRecord(contender);
        record.deferreds.add(deferred);
        wm.set(contender, record);
      } else if (record.settled) {
        // If the value has settled, it is safe to call
        // Promise.resolve(contender).then on it.
        Promise.resolve(contender).then(resolve, reject);
      } else {
        record.deferreds.add(deferred);
      }
    }
  });

  // The finally callback executes when any value settles, removing this race's
  // deferred from every contender's record so the unresolved values don't
  // retain a reference to the resolved value.
  return result.finally(() => {
    for (const contender of contenders) {
      if (isPromiseLike(contender)) {
        const record = wm.get(contender);
        if (record) {
          record.deferreds.delete(deferred);
        }
      }
    }
  }) as Promise<Awaited<T>>;
}
