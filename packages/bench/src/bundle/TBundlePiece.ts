import type { EBundlePiece } from './EBundlePiece';
import type { TBundleFinding } from './TBundleFinding';
import type { TBundleReading } from './TBundleReading';

/**
 * THE ONE MODULE THE ARM TABLE WATCHES — for every arm, "did the bundler keep
 * this file, and at what cost". ONE module and not a list, so the column can be
 * checked against `packages/core/tests/what-an-import-retains.test.ts` by a
 * single comparison. Each piece names the module whose presence or absence in an
 * arm IS its decision.
 */
export type TBundleSpotlight = {
    /** Path suffix under `packages/core/src`, matched without caring about separators. */
    readonly module: string;
    /** The column heading. Short — it sits over a byte count or the word "no". */
    readonly label: string;
    /** How the prose under the table refers to the file. */
    readonly name: string;
};

/**
 * ONE MEASURED ROW, DECOMPOSED INTO THE MODULES WHOSE CONTRIBUTION MOVED — see
 * `retainedDelta` in `formatBundleReport.ts` for why a total is not enough.
 *
 * A piece may leave this empty. It may not leave it wrong: `from` and `to` have
 * to be the same two arms the finding of `findingId` subtracted, or the
 * decomposition is decomposing a different number than the one above it.
 */
export type TBundleDecomposition = {
    readonly findingId: string;
    readonly from: string;
    readonly to: string;
};

/**
 * WHAT TO CONCLUDE IF THE NUMBER COMES OUT SMALL — in source, so it is written
 * before anybody has seen the reading. A measurement that refutes the claim it
 * was built for is the one most likely to be quietly dropped.
 */
export type TBundleClosing = {
    readonly heading: string;
    readonly paragraphs: readonly string[];
};

/**
 * ONE CLAIM, ITS ARMS, ITS CONTROLS AND ITS ARGUMENT — the unit of a run.
 * Everything in `report.txt` that is not a byte count comes from one of these
 * fields, so the prose and the numbers cannot drift into disagreeing about what
 * was measured.
 */
export type TBundlePiece = {
    readonly id: EBundlePiece;
    /** One line, printed by `--list`. What this piece answers. */
    readonly what: string;
    readonly title: string;
    readonly intro: string;
    /**
     * Every arm this piece builds, INCLUDING the two the controls need. Ids
     * resolved against `bundleArms`, so a typo is a startup error rather than a
     * missing row.
     */
    readonly armIds: readonly string[];
    readonly findings: (readings: readonly TBundleReading[]) => readonly TBundleFinding[];
    readonly spotlight: TBundleSpotlight;
    readonly decompose: readonly TBundleDecomposition[];
    readonly closing: TBundleClosing;
};
