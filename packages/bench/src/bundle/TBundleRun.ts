import type { TBundleReading } from './TBundleReading';
import type { TBundleToolchain } from './TBundleToolchain';

/**
 * EVERYTHING ONE INVOCATION PRODUCED.
 *
 * NO `refused` AND NO `failed`, unlike the price harness. An arm that threw is
 * not a smaller run — it is a run whose denominator or whose pair is missing,
 * which makes every remaining row unreadable. A failure here ends the process
 * rather than becoming a list, and this type has nowhere to put one on purpose.
 */
export type TBundleRun = {
    readonly readings: readonly TBundleReading[];
    readonly toolchain: TBundleToolchain;
};
