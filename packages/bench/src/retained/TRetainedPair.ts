import type { ERetainedPath } from './ERetainedPath';
import type { TRetainedArm } from './TRetainedArm';
import type { TRetainedPopulation } from './TRetainedPopulation';

/**
 * ONE RETENTION CLAIM: a population with the thing under test, the same
 * population without it, and the statement of what else differs between them.
 *
 * `caveat` must never be empty, and the catalogue refuses a pair that leaves it
 * blank. A memory delta is a SUBTRACTION OF TWO WHOLE-PROCESS NUMBERS, so
 * anything differing between the arms lands in it — the mechanism, what it causes
 * downstream, every container it leaves with capacity, and every byte of compiled
 * code the arms do not share.
 */
export type TRetainedPair = {
    /** What `--only` matches on. Never renamed once published. */
    readonly id: string;
    readonly path: ERetainedPath;
    /** The population WITH the thing under test, as the code a consumer writes. */
    readonly on: string;
    readonly off: string;
    /**
     * Where the two arms are NOT the same population apart from the mechanism,
     * and which direction that pushes the delta. Printed under the row.
     */
    readonly caveat: string;
    /**
     * WHAT ARITHMETIC SAYS THE BYTES PER ROW MUST BE. ABSENT ON EVERY CLAIM
     * ROW, deliberately: a pair carrying its own expected answer would be marking
     * its own homework. Claim rows are read against the bytes-per-reference the
     * CONTROLS measured.
     */
    readonly expectedBytesPerRow?: readonly number[];
    /**
     * Controls attest the instrument and are never ranked with the claims. Their
     * failure voids the report; a claim row's cannot.
     */
    readonly isControl?: true;
    /**
     * One arm, built in a process that has never seen the other, and CALLED TWICE
     * there — a discarded warm-up before the baseline, then the measurement. A
     * `build` that is not repeatable, or that leaves state behind the second call
     * would find, breaks the measurement.
     */
    readonly build: (arm: TRetainedArm) => TRetainedPopulation;
};
