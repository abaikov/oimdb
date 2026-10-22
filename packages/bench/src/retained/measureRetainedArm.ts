import { getHeapStatistics } from 'node:v8';

import type { TRetainedArm } from './TRetainedArm';
import type { TRetainedArmReading } from './TRetainedArmReading';
import type { TRetainedPair } from './TRetainedPair';
import type { TRetainedSettle } from './TRetainedSettle';

/**
 * THE INSTRUMENT: `v8.getHeapStatistics().used_heap_size`, and nothing else. NOT
 * `process.memoryUsage()`, whose headline `rss` moves for reasons unrelated to
 * what an object graph holds; NOT `total_heap_size`, capacity rather than
 * occupancy; NOT `v8.getHeapSnapshot()`, which would mean parsing tens of
 * megabytes of JSON inside the process being measured for the same quantity.
 *
 * NO ABSOLUTE READING IS EVER PRINTED. `used_heap_size` after a full collection
 * is near the live set but not equal to it, and that error is SHARED by two arms
 * that built the same population in the same order. Hence: THE ARMS OF A PAIR
 * MUST BE AS ALIKE AS THEY CAN BE MADE.
 *
 * Neither package under test uses `FinalizationRegistry` or `WeakRef` (checked,
 * not assumed), so the settle loop can be synchronous.
 */

const liveBytes = (): number => getHeapStatistics().used_heap_size;

/**
 * Two V8 pages, and well under the smallest delta this catalogue resolves.
 * Tighter and a settled heap still jitters by the odd page; looser and the exit
 * condition stops being evidence.
 */
const SETTLED_WITHIN_BYTES = 64 * 1024;

/**
 * The fewest collections before the exit condition may be believed: two readings
 * can agree right after the first collection while a later pass still has
 * something to free.
 */
const LEAST_COLLECTIONS = 4;

/** Beyond this the heap is not settling, and the row is reported as unsettled. */
const MOST_COLLECTIONS = 16;

/**
 * Collect until the heap stops moving, then read it. The count and the gap travel
 * out so a reader can see the convergence rather than take this loop's word.
 */
export const settleHeap = (collect: () => void): TRetainedSettle => {
    let previous = liveBytes();
    let collections = 0;
    let gapBytes = Number.POSITIVE_INFINITY;
    while (collections < MOST_COLLECTIONS) {
        collect();
        collections++;
        const now = liveBytes();
        gapBytes = Math.abs(now - previous);
        previous = now;
        if (collections >= LEAST_COLLECTIONS && gapBytes <= SETTLED_WITHIN_BYTES) break;
    }
    return { bytes: previous, collections, gapBytes };
};

export const hasSettled = (settle: TRetainedSettle): boolean =>
    settle.collections < MOST_COLLECTIONS || settle.gapBytes <= SETTLED_WITHIN_BYTES;

/**
 * ONE ARM, MEASURED. Build and discard; settle and read the BASELINE; build and
 * hold by exactly one reference; settle and read it HELD; drop the reference,
 * settle, read it RELEASED. That order is the measurement.
 *
 * THE DISCARDED BUILD IS THE WARM-UP. A body's first run allocates compiled code,
 * feedback vectors and hidden class transitions — hundreds of kilobytes, not
 * proportional to the population, and NOT the same on two arms running slightly
 * different code. Discarded, it lands in the baseline rather than the answer.
 *
 * Only `root` escapes the builder's scope: a builder whose locals stay reachable
 * puts its scratch space inside the number.
 */
export const measureRetainedArm = (
    pair: TRetainedPair,
    arm: TRetainedArm,
    collect: () => void,
    gcAvailable: boolean,
): TRetainedArmReading => {
    // The warm-up. Its return value is deliberately not stored anywhere that
    // outlives this statement.
    pair.build(arm);

    const baseline = settleHeap(collect);

    // A holder object rather than a `let`: a field written to `undefined` is a
    // store V8 observes, where a module-scope binding lives in a context object
    // the engine keeps for the life of the module.
    const holder: { root: unknown } = { root: undefined };
    const rows = ((): number => {
        const population = pair.build(arm);
        holder.root = population.root;
        // `population` dies with this scope, so nothing but `holder` reaches the
        // root by the time the next reading is taken.
        return population.rows;
    })();

    const held = settleHeap(collect);
    const statistics = getHeapStatistics();

    holder.root = undefined;
    const released = settleHeap(collect);

    return {
        pair: pair.id,
        arm,
        baseline,
        held,
        released,
        retainedBytes: held.bytes - baseline.bytes,
        releasedDeltaBytes: held.bytes - released.bytes,
        residueBytes: released.bytes - baseline.bytes,
        rows,
        externalBytes: statistics.external_memory,
        heapLimitBytes: statistics.heap_size_limit,
        gcAvailable,
        node: process.version,
    };
};
