import type { TRetainedArmReading } from './TRetainedArmReading';

/**
 * ONE ROW OF THE REPORT: two populations, three processes, one delta. Both `off`
 * readings are carried out rather than averaged; why they are taken in that order
 * is in `runRetainedPairs.ts`.
 */
export type TRetainedReading = {
    readonly id: string;
    readonly path: string;
    readonly on: string;
    readonly off: string;
    readonly caveat: string;
    readonly isControl: boolean;
    readonly expectedBytesPerRow?: readonly number[];

    readonly onBytes: number;
    /** From the process measured BEFORE the `on` arm. */
    readonly offBytes: number;
    /** The same, from the process measured AFTER it. Identical code. */
    readonly offAgainBytes: number;

    /** `onBytes - offBytes`. Positive means the thing under test COSTS this. */
    readonly deltaBytes: number;
    /**
     * `|offAgainBytes - offBytes|` — this row's own floor. A DELTA NO LARGER THAN
     * IT IS NOT A READING, whatever the run-wide control says.
     */
    readonly noiseBytes: number;
    /** `deltaBytes / rows`. What the report reads against the controls. */
    readonly bytesPerRow: number;
    readonly rows: number;

    /**
     * The largest disagreement, on either arm, between the two directions the
     * retention was measured in. Large next to the delta means an arm left
     * something reachable after its root was dropped, and the delta is not purely
     * retention.
     */
    readonly residueBytes: number;
    /** The largest settle gap any of the three processes stopped at. */
    readonly settleGapBytes: number;
    /** Whether every settle in the row converged before the collection ceiling. */
    readonly settled: boolean;

    readonly arms: readonly TRetainedArmReading[];
    readonly gcAvailable: boolean;
    readonly node: string;
};
