import type { TRetainedRecord } from './TRetainedRecord';

/**
 * EVERYTHING ONE INVOCATION PRODUCED, INCLUDING WHAT IT DID NOT MEASURE.
 *
 * The three lists mean three different things and are kept apart for the reason
 * `TPriceRun` gives at length: a measurement not taken on a busy machine is the
 * correct outcome, and a pair that was started and produced nothing is a bug.
 * Flattening them makes a busy laptop look like a broken pair.
 *
 * ONE FAILURE MODE IS THIS HARNESS'S OWN and lands in `failed`: a pair whose two
 * arms disagreed about `rows`. That is not a machine problem and not a crash
 * — it is the two populations not being the same population apart from the thing
 * under test, which is the assumption every delta here rests on. It fails the
 * pair rather than printing a bytes-per-row computed from a divisor only one
 * arm agreed with.
 */
export type TRetainedRun = {
    readonly records: readonly TRetainedRecord[];
    /** One line per pair, already carrying the reason the gate gave. */
    readonly refused: readonly string[];
    /** One line per pair, already carrying the first lines of the error. */
    readonly failed: readonly string[];
};
