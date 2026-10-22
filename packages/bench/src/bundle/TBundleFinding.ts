/**
 * ONE DIFFERENCE BETWEEN TWO BUNDLES — never one bundle's size. The two absolute
 * sizes are printed beside the gap only so it can be checked.
 *
 * `share` IS THE HALF THAT NEEDS THE DISCLAIMER: a percentage is a fact plus a
 * choice of denominator, and the denominator here is the largest one available
 * (`consumers/everything.ts`), chosen against our own interest because this
 * percentage is quoted as the reason for a public API's shape.
 *
 * A CONTROL IS A FINDING TOO, and carries `holds`. It is not scored and not
 * ranked, and if it comes out false the whole report is void.
 */
export type TBundleFinding = {
    readonly id: string;
    readonly isControl: boolean;
    /** What this row answers, in one sentence, printed above the numbers. */
    readonly question: string;

    /** Arm ids, or an arm id and a unit, depending on what is being compared. */
    readonly fromLabel: string;
    readonly toLabel: string;

    readonly fromBytes: number;
    readonly toBytes: number;
    readonly fromGzipBytes: number;
    readonly toGzipBytes: number;

    /** `to - from`. Positive means the second bundle is the larger one. */
    readonly deltaBytes: number;
    readonly deltaGzipBytes: number;

    /**
     * The delta over the whole package, in the same unit. `undefined` on a
     * control, where a share of the package would mean nothing.
     */
    readonly share: number | undefined;
    readonly gzipShare: number | undefined;

    /** What this row had to come out at for the report to stand. */
    readonly requirement: string;
    readonly holds: boolean;

    /** How to read the number — the caveats, in full, printed under the row. */
    readonly caveat: string;
};
