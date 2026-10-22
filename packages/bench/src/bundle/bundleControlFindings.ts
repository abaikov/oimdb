import {
    ARM_DATABASE_ONLY,
    ARM_EVERYTHING,
    CONTROL_MINIFIED,
    CONTROL_TREE_SHAKING,
    MINIFIED_AT_MOST,
    SHAKEN_AT_MOST,
} from './bundleControls';
import type { TBundleFinding } from './TBundleFinding';
import type { TBundleReading } from './TBundleReading';

/**
 * THE TWO ROWS EVERY PIECE CARRIES, WRITTEN ONCE.
 *
 * A piece owns its claim, its arms and its argument, and does NOT own its
 * controls: a piece that could write its own could write weaker ones, and the
 * first to do that would be the one whose number came out inconveniently. Which
 * failure each catches is in `bundleControls.ts`.
 */
const readingOf = (readings: readonly TBundleReading[], id: string): TBundleReading => {
    const found = readings.find(reading => reading.id === id);
    if (found === undefined) throw new Error(`bundle: no reading for arm "${id}"`);
    return found;
};

export const bundleControlFindings = (
    readings: readonly TBundleReading[],
): readonly TBundleFinding[] => {
    const everything = readingOf(readings, ARM_EVERYTHING);
    const databaseOnly = readingOf(readings, ARM_DATABASE_ONLY);

    const treeShaking: TBundleFinding = {
        id: CONTROL_TREE_SHAKING,
        isControl: true,
        question: 'Is the bundler dropping code nothing reaches?',
        fromLabel: `${ARM_EVERYTHING} (minified)`,
        toLabel: `${ARM_DATABASE_ONLY} (minified)`,
        fromBytes: everything.minifiedBytes,
        toBytes: databaseOnly.minifiedBytes,
        fromGzipBytes: everything.minifiedGzipBytes,
        toGzipBytes: databaseOnly.minifiedGzipBytes,
        deltaBytes: databaseOnly.minifiedBytes - everything.minifiedBytes,
        deltaGzipBytes: databaseOnly.minifiedGzipBytes - everything.minifiedGzipBytes,
        share: undefined,
        gzipShare: undefined,
        requirement: `a database alone under ${(SHAKEN_AT_MOST * 100).toFixed(0)}% of the whole surface`,
        holds: databaseOnly.minifiedBytes < everything.minifiedBytes * SHAKEN_AT_MOST,
        caveat:
            'An application that constructs a database and touches nothing else must not carry the '
            + 'hundred modules of the published surface. If this reads near 1.00 the bundler kept '
            + 'everything, every arm below is the same bundle under four names, and every difference '
            + 'in this report is a rounding of zero — including the one it was written to settle, '
            + 'which would then read as "the ordered-list diff is free". That is a conclusion this '
            + 'project would enjoy and has not earned, so it voids the report instead.',
    };

    const minified: TBundleFinding = {
        id: CONTROL_MINIFIED,
        isControl: true,
        question: 'Is the minifier running at all?',
        fromLabel: `${ARM_EVERYTHING} (bundled, not minified)`,
        toLabel: `${ARM_EVERYTHING} (minified)`,
        fromBytes: everything.bundledBytes,
        toBytes: everything.minifiedBytes,
        fromGzipBytes: everything.bundledGzipBytes,
        toGzipBytes: everything.minifiedGzipBytes,
        deltaBytes: everything.minifiedBytes - everything.bundledBytes,
        deltaGzipBytes: everything.minifiedGzipBytes - everything.bundledGzipBytes,
        share: undefined,
        gzipShare: undefined,
        requirement: `minified under ${(MINIFIED_AT_MOST * 100).toFixed(0)}% of the same bundle unminified`,
        holds: everything.minifiedBytes < everything.bundledBytes * MINIFIED_AT_MOST,
        caveat:
            'This package ships roughly as many bytes of comment as of code, and a claim about what '
            + 'is SHIPPED is a claim about output a minifier has already been through. If these two '
            + 'numbers are equal the minifier did nothing, and every kilobyte below is mostly prose — '
            + 'in the direction that flatters the decision the claim defends, which is the one to '
            + 'guard hardest.',
    };

    return [treeShaking, minified];
};

/** The same lookup the findings modules make, exported so each does not write its own. */
export const bundleReadingOf = readingOf;
