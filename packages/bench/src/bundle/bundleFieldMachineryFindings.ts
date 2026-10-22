import { bundleControlFindings, bundleReadingOf } from './bundleControlFindings';
import { ARM_EVERYTHING, ARM_FIELD_FLOOR, ARM_FIELD_LIFTED } from './bundleControls';
import type { TBundleFinding } from './TBundleFinding';
import type { TBundleReading } from './TBundleReading';

/**
 * THE ONE STATEMENT THE FIELD-MACHINERY PIECE MAKES, DERIVED FROM THE READINGS
 * AND FROM NOTHING ELSE.
 *
 * Measured FROM the counterfactual and TO the shipped engine, so the delta reads
 * as what the apparatus ADDS to an application that never uses it. Subtracting
 * the other way round would print the same magnitude as a saving somebody could
 * quote as achieved, and nothing has been split.
 */
export const bundleFieldMachineryFindings = (
    readings: readonly TBundleReading[],
): readonly TBundleFinding[] => {
    const everything = bundleReadingOf(readings, ARM_EVERYTHING);
    const lifted = bundleReadingOf(readings, ARM_FIELD_LIFTED);
    const floor = bundleReadingOf(readings, ARM_FIELD_FLOOR);

    const deltaBytes = floor.minifiedBytes - lifted.minifiedBytes;
    const deltaGzipBytes = floor.minifiedGzipBytes - lifted.minifiedGzipBytes;

    const fieldMachinery: TBundleFinding = {
        id: 'field-machinery-diff',
        isControl: false,
        question:
            'What does the per-column subscription apparatus add to an application that never '
            + 'asks for a column slot?',
        fromLabel: `${ARM_FIELD_LIFTED} (minified)`,
        toLabel: `${ARM_FIELD_FLOOR} (minified)`,
        fromBytes: lifted.minifiedBytes,
        toBytes: floor.minifiedBytes,
        fromGzipBytes: lifted.minifiedGzipBytes,
        toGzipBytes: floor.minifiedGzipBytes,
        deltaBytes,
        deltaGzipBytes,
        share: deltaBytes / everything.minifiedBytes,
        gzipShare: deltaGzipBytes / everything.minifiedGzipBytes,
        requirement: 'none — this row is the measurement, not an attestation',
        holds: true,
        caveat:
            'READ THE GZIPPED NUMBER. Minified bytes are what a bundle report shows and what an '
            + 'argument gets made with; gzipped bytes are what a user downloads, and it is the '
            + 'gzipped column this row should be quoted from. '
            + 'THE 2026-08-22 FIGURE FOR THIS ROW NAME (+2.51 KB minified, +0.57 KB gzipped, '
            + 'measurements/2026-08-22-bundle/field-machinery) MAY NOT BE CARRIED ACROSS AND IS '
            + 'NOT A PREDICTION FOR THIS ONE. It priced `slot.movedFields`, `recordMovedFields` '
            + 'and the `dependsOn` column routing — a module, a recording function, a '
            + 'declared-column check and a routing loop — all deleted on 2026-08-23. What is '
            + 'excised now is the `createColumnOwner` option of createOIMEntityService and '
            + 'createOIMBucketSlotOwnerService, three `columnOwner.markColumnsChanged` calls in the write '
            + 'layers, one property of the '
            + 'slot literal, and the column owner those keep alive. '
            + 'NO FIGURE IS PREDICTED FOR EITHER COLUMN [FIGURE STATED IN ADVANCE], and the '
            + 'direction that IS stated in advance is that a number of that recorded magnitude '
            + 'would be the surprise rather than the confirmation, because the surface being '
            + 'removed is smaller by inspection. '
            + 'THE ROW IS A LOWER BOUND on what a split would save, and every omission points the '
            + 'same way: the excision leaves both `import { createOIMColumnOwnerPushDriven }` lines in '
            + 'place, leaves the column owner construction and `hasColumnSlots` in `OIMSlotOwnerService`, '
            + 'leaves the computed services and their pull-driven owner alone '
            + '(this consumer does not import them), and leaves every doc comment of '
            + 'every row it removed. There is nothing in it that could make the difference '
            + 'larger than a real split would. THE SECOND ARM IS A COUNTERFACTUAL: no published '
            + '@oimdb/core builds it, and what was taken out is listed under the arm below and in '
            + 'records.json. THE PROOF THE LIST IS COMPLETE is in the module table — the imports '
            + 'were left in, so if any link to the column owner had been missed the bundler would have '
            + 'kept engine/column/OIMColumnOwnerPushDriven.ts in the lifted arm too, which is what the '
            + '"columns?" column reports. THE DENOMINATOR is every name the '
            + 'package exports with nothing droppable, the largest available and therefore the '
            + 'least flattering to the percentage.',
    };

    return [...bundleControlFindings(readings), fieldMachinery];
};
