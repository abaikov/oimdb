import type { EPricePath } from './EPricePath';
import type { TPriceSide } from './TPriceSide';
import type { TPriceWanted } from './TPriceWanted';

/**
 * ONE PRICE TAG: a call this library offers, the primitive it replaces, and the
 * statement of where the two are not doing the same work.
 *
 * `caveat` is the load-bearing field of this whole measurement, and must never
 * be empty. No pair in this suite has two exactly equal sides, and a floor that
 * does LESS than the call is a lie in our favour. The number is honest only if
 * the reader is told which way the difference pushes it, so the report prints
 * this line under every row and the runner refuses a pair that leaves it blank.
 */
export type TPricePair = {
    /**
     * Stable, and what `--only` matches on. Never renamed once published.
     *
     * AND IT IS WHAT DECIDES WHICH CATALOGUE THIS PAIR IS IN, checked at module
     * load rather than left to which array the pair was spread
     * into. An ALTERNATIVES id begins `alt.` and a PRICE id does not, and
     * `pricePairs.ts` throws either way round. The two catalogues share this type,
     * the runner, the worker, the gate and the controls — deliberately, so neither
     * can be timed differently from the other — so before the check the only thing
     * assigning a pair was a spread, and a pair in the wrong array printed a
     * correct, well-formatted row that a reader took exactly backwards: below 1.00
     * is "the rejected design lost" in one table and "we are cheaper than a `Map`"
     * in the other.
     *
     * WHICH ONE YOU ARE WRITING is decided by what stands in `floor`: something a
     * USER would have written instead of calling us is a price; something WE built
     * and refused is an alternative. If both arms are reachable from a consumer's
     * `import` it is neither — it is a fork, and a fork is priced per arm in
     * `priced` so the consumer reads two price tags rather than one ratio calling
     * their own choice wrong.
     */
    readonly id: string;
    readonly path: EPricePath;
    /** What we charge for, as the code a consumer writes. */
    readonly ours: string;
    /** The primitive, as the plain JavaScript it is. */
    readonly floor: string;
    /**
     * Where the two sides are NOT doing the same work, and which direction that
     * pushes the ratio. Printed under the row; a blank one fails the pair.
     */
    readonly caveat: string;
    /**
     * MUST THE TWO SIDES BE KEPT IN SEPARATE PROCESSES?
     *
     * Normally no: one process is the stronger measurement — one heap, one
     * dataset, the floor timed twice around our side so drift shows on the row.
     * That holds because a floor is hand-written JavaScript that never enters
     * `@oimdb/core`; the sides share a machine but not a code path.
     *
     * IT STOPS WORKING WHEN BOTH SIDES GO THROUGH THE SAME LIBRARY CODE WITH
     * DIFFERENT OBJECT SHAPES. Inline caches belong to the compiled body, not to
     * the receiver, so our side would be measured through caches the other arm
     * already made megamorphic. That is undetectable from the row: a 1.00 is
     * equally consistent with "the shape is free" and "the floor spoiled the
     * caches ours ran through".
     *
     * The cost is three processes instead of one, and `noise` widens to include
     * process-to-process variation — honest, since that variation is now inside
     * the ratio.
     */
    readonly isolate?: true;
    /**
     * Both halves, built together in one process so they share one machine
     * state, one heap and one dataset.
     *
     * An `isolate` pair receives `'ours'` or `'floor'` and must return an inert
     * side for the other one — building it is the thing being avoided.
     */
    readonly build: (wanted: TPriceWanted) => {
        readonly ours: TPriceSide;
        readonly floor: TPriceSide;
    };
};
