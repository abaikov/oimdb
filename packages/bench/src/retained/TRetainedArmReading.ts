import type { TRetainedArm } from './TRetainedArm';
import type { TRetainedSettle } from './TRetainedSettle';

/**
 * WHAT ONE PROCESS FOUND OUT ABOUT ONE ARM — three settled heap readings and
 * everything needed to dispute them. The baseline is taken AFTER a discarded
 * warm-up build, so compiled code and inline-cache feedback are in it rather than
 * in the delta.
 *
 * The same quantity is therefore measured twice, in opposite directions:
 * `held - baseline` up and `held - released` down. THEY ARE NOT THE SAME
 * MEASUREMENT — the first includes anything the build allocated and never gave
 * back, the second only what the root was holding. Their disagreement is
 * `residueBytes`, and it is what says whether the number is retention or
 * bookkeeping. The instrument itself is in `measureRetainedArm.ts`.
 */
export type TRetainedArmReading = {
    readonly pair: string;
    readonly arm: TRetainedArm;

    readonly baseline: TRetainedSettle;
    readonly held: TRetainedSettle;
    readonly released: TRetainedSettle;

    /** `held - baseline`: what the population added. The headline. */
    readonly retainedBytes: number;
    /** `held - released`: the same quantity, measured on the way down. */
    readonly releasedDeltaBytes: number;
    /** `released - baseline`: what the build left behind for good. */
    readonly residueBytes: number;

    /** The pair's divisor, reported by both arms and checked for agreement. */
    readonly rows: number;

    /**
     * Not part of any delta — carried so that bytes moved out of the managed heap
     * cannot pass for bytes saved.
     */
    readonly externalBytes: number;
    /** For reading a run that came near it. */
    readonly heapLimitBytes: number;

    /**
     * Without it the readings are whatever the collector happened to have done,
     * and the report is void.
     */
    readonly gcAvailable: boolean;
    readonly node: string;
};
