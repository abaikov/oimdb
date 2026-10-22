import { bundleControlFindings, bundleReadingOf } from './bundleControlFindings';
import { ARM_EVERYTHING, ARM_WITH, ARM_WITHOUT } from './bundleControls';
import type { TBundleFinding } from './TBundleFinding';
import type { TBundleReading } from './TBundleReading';

/**
 * THE ONE STATEMENT THE ORDERED-LIST PIECE MAKES, DERIVED FROM THE READINGS AND
 * FROM NOTHING ELSE — one module, so the artifact and the terminal cannot
 * disagree about a rounding. Same reason `writePriceRun.ts` regenerates
 * `report.txt` from `records.json` rather than capturing stdout.
 */
export const bundleOrderedListFindings = (
    readings: readonly TBundleReading[],
): readonly TBundleFinding[] => {
    const everything = bundleReadingOf(readings, ARM_EVERYTHING);
    const without = bundleReadingOf(readings, ARM_WITHOUT);
    const withOrdered = bundleReadingOf(readings, ARM_WITH);

    const deltaBytes = withOrdered.minifiedBytes - without.minifiedBytes;
    const deltaGzipBytes = withOrdered.minifiedGzipBytes - without.minifiedGzipBytes;

    const orderedList: TBundleFinding = {
        id: 'ordered-list-diff',
        isControl: false,
        question:
            'What does asking for an ordered list add to an application that was not going to have one?',
        fromLabel: `${ARM_WITHOUT} (minified)`,
        toLabel: `${ARM_WITH} (minified)`,
        fromBytes: without.minifiedBytes,
        toBytes: withOrdered.minifiedBytes,
        fromGzipBytes: without.minifiedGzipBytes,
        toGzipBytes: withOrdered.minifiedGzipBytes,
        deltaBytes,
        deltaGzipBytes,
        share: deltaBytes / everything.minifiedBytes,
        gzipShare: deltaGzipBytes / everything.minifiedGzipBytes,
        requirement: 'none — this row is the measurement, not an attestation',
        holds: true,
        caveat:
            'THIS IS THE NUMBER EIGHT SITES IN THIS REPOSITORY QUOTE AS "some 2.7 KB — around 4% of '
            + 'the package", and it is the whole quantitative half of the argument for '
            + '`createOrderedCommands` being a free function rather than a method on `OIMDB`. Read it '
            + 'as the cost a METHOD would have imposed: every consumer imports `OIMDB`, a bundler '
            + 'cannot drop a class\'s methods one at a time, so under that design the arm on the left '
            + 'would have carried the same bytes as the arm on the right. WHAT THE DIFFERENCE '
            + 'CONTAINS: the `createOrderedCommands` module, the `diffOrderedList` module it pins, and '
            + 'the three-line call site — the call site is NOT subtracted, because an application that '
            + 'renders an ordered list writes one under either design, so treating this as the cost of '
            + 'the modules alone over-states it by a few dozen bytes. THE DENOMINATOR is every name '
            + 'the package exports with nothing droppable, which is the largest one available and '
            + 'therefore the least flattering to the percentage.',
    };

    return [...bundleControlFindings(readings), orderedList];
};
