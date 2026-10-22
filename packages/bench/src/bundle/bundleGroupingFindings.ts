import { bundleControlFindings, bundleReadingOf } from './bundleControlFindings';
import {
    ARM_EVERYTHING,
    ARM_GROUPING_LAYER_PINNED,
    ARM_GROUPING_NONE,
    ARM_GROUPING_ONE,
    ARM_GROUPING_ONE_ORDER_OPTION,
    ARM_GROUPING_ONE_SHARED_MODULE,
} from './bundleControls';
import type { TBundleFinding } from './TBundleFinding';
import type { TBundleReading } from './TBundleReading';

/**
 * THE THREE STATEMENTS THE GROUPING PIECE MAKES, EACH FROM ONE PAIR OF ARMS.
 *
 * Three rows in one piece because they share a program, share two baselines and
 * share every control — and because the interesting reading is the ORDER of the
 * three, which is invisible to three artifacts recorded apart.
 *
 * EVERY ROW CARRIES ITS PREDICTION IN ITS CAVEAT, each arrived at by adding up
 * module sizes in the `2026-08-21-bundle/ordered-list` artifact. Arithmetic over
 * an artifact is NOT a measurement, so no figure from it is cited on any
 * documentation page or in any decision entry. They are written here, before the
 * run, so the run confirms or refutes each out loud.
 *
 * ROWS ARE NEVER ATTESTATIONS. `requirement` is "none" and `holds` is true on
 * all three: only a control can fail, and a prediction coming out wrong is a
 * result rather than a broken instrument.
 */
export const bundleGroupingFindings = (
    readings: readonly TBundleReading[],
): readonly TBundleFinding[] => {
    const everything = bundleReadingOf(readings, ARM_EVERYTHING);
    const none = bundleReadingOf(readings, ARM_GROUPING_NONE);
    const layerPinned = bundleReadingOf(readings, ARM_GROUPING_LAYER_PINNED);
    const one = bundleReadingOf(readings, ARM_GROUPING_ONE);
    const sharedModule = bundleReadingOf(readings, ARM_GROUPING_ONE_SHARED_MODULE);
    const orderOption = bundleReadingOf(readings, ARM_GROUPING_ONE_ORDER_OPTION);

    const row = (
        id: string,
        question: string,
        from: TBundleReading,
        to: TBundleReading,
        caveat: string,
    ): TBundleFinding => {
        const deltaBytes = to.minifiedBytes - from.minifiedBytes;
        const deltaGzipBytes = to.minifiedGzipBytes - from.minifiedGzipBytes;
        return {
            id,
            isControl: false,
            question,
            fromLabel: `${from.id} (minified)`,
            toLabel: `${to.id} (minified)`,
            fromBytes: from.minifiedBytes,
            toBytes: to.minifiedBytes,
            fromGzipBytes: from.minifiedGzipBytes,
            toGzipBytes: to.minifiedGzipBytes,
            deltaBytes,
            deltaGzipBytes,
            share: deltaBytes / everything.minifiedBytes,
            gzipShare: deltaGzipBytes / everything.minifiedGzipBytes,
            requirement: 'none — this row is the measurement, not an attestation',
            holds: true,
            caveat,
        };
    };

    return [
        ...bundleControlFindings(readings),

        row(
            'grouping-layer-diff',
            'What would the grouping layer cost an application that never groups anything, if the '
            + 'four groupings hung off the collection class as methods?',
            none,
            layerPinned,
            'THE DECISION THIS ROW PRICES IS WHETHER A GROUPING IS A FREE FUNCTION RATHER THAN A '
            + 'COLLECTION METHOD. Every '
            + 'consumer of this library holds a POPULATION; a bundler cannot drop a class\'s methods '
            + 'one at a time; so under the method form the arm on the left would have carried '
            + 'everything the arm on the right carries — the four grouping bodies and every address '
            + 'store, row set source and bucket service they name — without a line of the application '
            + 'being able to reach any of it. WHAT THE ARM ON THE RIGHT STANDS IN FOR: the four '
            + 'names are pushed rather than written as four method bodies inside `OIMCollection`, '
            + 'which loses the method form four function signatures and four module wrappers — tens '
            + 'of bytes in ITS favour, against a closure both forms carry identically. The '
            + 'decomposition below names that closure module by module, so the claim can be checked '
            + 'rather than believed. PREDICTED ≈14.8 KB minified, by adding up module sizes in the '
            + 'ordered-list artifact — arithmetic over an artifact, not a measurement, stated here '
            + 'so this run either confirms or refutes it.',
        ),

        row(
            'grouping-shared-module-diff',
            'What would one shared grouping module cost a caller who takes exactly one grouping?',
            one,
            sharedModule,
            'THE DECISION THIS ROW PRICES IS WHETHER EACH GROUPING IS ITS OWN MODULE WITH ITS OWN '
            + 'MEMO. A module exporting four '
            + 'INDEPENDENT functions would shake per export and this row would read near zero — that '
            + 'is not the design that was turned down. The one turned down is a single module over '
            + 'ONE memo keyed by the columns and a token saying which grouping it was, so one '
            + 'mint-and-memo helper serves all four shapes, and a helper branching over a token names '
            + 'every address store and every row set source from one function body. A bundler '
            + 'cannot see past a runtime test. WHAT THE ARM ON THE RIGHT STANDS IN FOR, and the '
            + 'direction it errs: the other three groupings are pushed rather than routed through a '
            + 'shared helper, so the shared form would write the mint scaffolding once instead of '
            + 'four times and save whatever that scaffolding costs while still dragging every '
            + 'strategy — this row is an UPPER BOUND, and the strategies are the kilobytes. THE '
            + 'REACHABILITY HALF IS NOT MEASURED HERE AND IS NOT OPEN: '
            + '`packages/core/tests/what-an-import-retains.test.ts` already asserts, with no '
            + 'toolchain, that `groupBy` retains none of `OIMBucketAddressStoreByIdentityChain`, '
            + '`OIMMembershipSourceDerivedMany` or `OIMMembershipSourceAll`. PREDICTED ≈4.5 KB '
            + 'minified for four grouping modules rather than one, by arithmetic over the '
            + 'ordered-list artifact rather than by a build — stated here so this run answers it.',
        ),

        row(
            'grouping-order-option-diff',
            'What would an `order?` option cost a caller who groups one column and keeps no positions?',
            one,
            orderOption,
            'THE DECISION THIS ROW PRICES IS WHETHER A GROUPING TAKES A CONSTRUCTED BUCKET SERVICE. '
            + 'Under the shipped design the bucket service arrives constructed, so `groupBy` names '
            + 'exactly one service — the set-driven fallback. Under the option form it names both arms of '
            + '`order === undefined ? new OIMBucketSlotsServiceSetDriven() : new OIMBucketSlotsServiceArrayDriven()`, '
            + 'and a bundler cannot see past a runtime test, so the array-driven service and the two '
            + 'modules only it reaches follow every consumer who groups ANYTHING. WHAT THE ARM ON '
            + 'THE RIGHT STANDS IN FOR: the class is referenced and never constructed, which is '
            + 'faithful — retention is decided by a live symbol naming the class, not by the `new` '
            + 'running — but the ternary itself and the option plumbing are absent, a few dozen bytes '
            + 'in the option form\'s favour that are NOT subtracted. THE REACHABILITY HALF IS '
            + 'ALREADY PINNED by `what-an-import-retains.test.ts`, whose own title says it: "the '
            + 'service is an argument, not an option". PREDICTED ≈5.6 KB minified, by arithmetic '
            + 'over the ordered-list artifact rather than by a build.',
        ),
    ];
};
