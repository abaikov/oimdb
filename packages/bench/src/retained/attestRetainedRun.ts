import {
    BYTES_PER_REFERENCE_ALLOWED,
    CONTROL_KNOWN_BYTES_LARGE,
    CONTROL_KNOWN_BYTES_SMALL,
    CONTROL_NOISE,
    KNOWN_BYTES_WITHIN,
} from './retainedControls';
import type { TRetainedRecord } from './TRetainedRecord';

/**
 * WHETHER THIS RUN MAY BE BELIEVED, DECIDED IN ONE PLACE: the report prints the
 * verdict and the runner exits on it, and they must never be able to disagree.
 */

/**
 * How large the run-wide noise floor may be before the whole table is unreadable.
 * The claims this catalogue settles are of the order of half a mebibyte to two,
 * so a larger floor leaves no room to state any of them — a statement about THESE
 * claims and not a universal bar.
 */
export const NOISE_FLOOR_AT_MOST_BYTES = 256 * 1024;

export type TRetainedAttestation = {
    /**
     * Bytes per reference as the largest known-size control measured it — the
     * platform constant every claim row's per-row figure is read against.
     * Undefined when that control did not run or did not land on a known value.
     */
    readonly bytesPerReference: number | undefined;
    /** Which of the two permitted answers the controls agreed on, if they did. */
    readonly pointerBytes: number | undefined;
    /** The noise control's delta: the floor, in bytes. */
    readonly noiseFloorBytes: number | undefined;
    /** Why this run may not be believed. Empty means it may. */
    readonly reasons: readonly string[];
    readonly attested: boolean;
};

/** The permitted answer nearest a measurement, and how far off it landed. */
const nearestAllowed = (
    measured: number,
): { readonly allowed: number; readonly error: number } => {
    let allowed = BYTES_PER_REFERENCE_ALLOWED[0];
    let error = Number.POSITIVE_INFINITY;
    for (const candidate of BYTES_PER_REFERENCE_ALLOWED) {
        const relative = Math.abs(measured - candidate) / candidate;
        if (relative < error) {
            error = relative;
            allowed = candidate;
        }
    }
    return { allowed, error };
};

export const attestRetainedRun = (
    records: readonly TRetainedRecord[],
): TRetainedAttestation => {
    const reasons: string[] = [];
    const find = (id: string): TRetainedRecord | undefined =>
        records.find(record => record.reading.id === id);

    const large = find(CONTROL_KNOWN_BYTES_LARGE);
    const small = find(CONTROL_KNOWN_BYTES_SMALL);
    const noise = find(CONTROL_NOISE);

    let bytesPerReference: number | undefined;
    let pointerBytes: number | undefined;

    if (large === undefined) {
        reasons.push(
            `the known-size control ${CONTROL_KNOWN_BYTES_LARGE} did not run, so nothing here has ` +
                'been shown to reproduce an allocation arithmetic knows exactly',
        );
    } else {
        const measured = large.reading.bytesPerRow;
        const nearest = nearestAllowed(measured);
        bytesPerReference = measured;
        if (nearest.error > KNOWN_BYTES_WITHIN) {
            reasons.push(
                `the known-size control measured ${measured.toFixed(2)} bytes per reference, which ` +
                    `is neither of the two answers a 64-bit V8 permits (4 with pointer compression, ` +
                    '8 without)',
            );
        } else {
            pointerBytes = nearest.allowed;
        }
    }

    if (small === undefined) {
        reasons.push(
            `the claim-scale control ${CONTROL_KNOWN_BYTES_SMALL} did not run, so the instrument ` +
                'has not been shown to resolve an allocation the size of the claims below',
        );
    } else {
        const nearest = nearestAllowed(small.reading.bytesPerRow);
        if (nearest.error > KNOWN_BYTES_WITHIN) {
            reasons.push(
                `the claim-scale control measured ${small.reading.bytesPerRow.toFixed(2)} bytes ` +
                    'per reference, so this instrument does not resolve an allocation the size of ' +
                    'the claims below even though it may resolve a larger one',
            );
        } else if (pointerBytes !== undefined && nearest.allowed !== pointerBytes) {
            reasons.push(
                `the two known-size controls disagree about the platform constant: ` +
                    `${String(pointerBytes)} bytes per reference at the larger size and ` +
                    `${String(nearest.allowed)} at the smaller. One of them is measuring something ` +
                    'other than the references',
            );
        }
    }

    let noiseFloorBytes: number | undefined;
    if (noise === undefined) {
        reasons.push(
            `the noise control ${CONTROL_NOISE} did not run, so there is no floor to read this ` +
                'table under',
        );
    } else {
        noiseFloorBytes = Math.abs(noise.reading.deltaBytes);
        if (noiseFloorBytes > NOISE_FLOOR_AT_MOST_BYTES) {
            reasons.push(
                `two identical populations came out ${(noiseFloorBytes / 1024).toFixed(1)} KiB ` +
                    'apart, which is too large a floor for the claims below to be stated against',
            );
        }
    }

    // Every record, including the claims: one arm that missed `--expose-gc` is
    // enough to make the delta it took part in meaningless.
    if (records.some(record => !record.reading.gcAvailable)) {
        reasons.push(
            'a worker did not get --expose-gc, so at least one reading is a collection schedule ' +
                'rather than a retention',
        );
    }

    return { bytesPerReference, pointerBytes, noiseFloorBytes, reasons, attested: reasons.length === 0 };
};
