import type { TPriceRecord } from './TPriceRecord';

/**
 * EVERYTHING ONE INVOCATION PRODUCED, INCLUDING WHAT IT DID NOT MEASURE.
 *
 *   `records`  — pairs that produced a reading. The table.
 *   `refused`  — pairs the runner declined to start on too busy a machine. NOT a
 *                failure; a measurement not taken beats one that is a story.
 *   `failed`   — pairs started that produced no reading. This IS a failure, and
 *                is what the non-zero exit code is for.
 *
 * Keep `refused` and `failed` apart: flattened, a busy laptop looks like a
 * broken pair, and that is the confusion that gets a red run ignored.
 */
export type TPriceRun = {
    readonly records: readonly TPriceRecord[];
    /** One line per pair, already carrying the reason the gate gave. */
    readonly refused: readonly string[];
    /** One line per pair, already carrying the first lines of the error. */
    readonly failed: readonly string[];
};
