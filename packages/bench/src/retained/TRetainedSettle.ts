/**
 * ONE HEAP READING, AND THE EVIDENCE THAT IT WAS TAKEN ON A SETTLED HEAP. A
 * reading taken before collection measures garbage, not retention, and the
 * difference is unbounded; one taken after a single collection measures whatever
 * that pass reached.
 *
 * `gapBytes` IS THE PART A READER SHOULD CHECK. It is what the last collection
 * changed, so it bounds what a further one could plausibly have changed: a row
 * whose settle gaps are large next to its delta is a row whose delta is partly
 * uncollected garbage, and the report marks it.
 */
export type TRetainedSettle = {
    readonly bytes: number;
    /** The ceiling means "did not settle". */
    readonly collections: number;
    readonly gapBytes: number;
};
