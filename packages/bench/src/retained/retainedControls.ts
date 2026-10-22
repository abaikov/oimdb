import { ERetainedPath } from './ERetainedPath';
import type { TRetainedPair } from './TRetainedPair';

/**
 * THE THREE ROWS PRINTED BEFORE ANY BYTE COUNT, and the reason a reader may
 * believe the rest of the table.
 *
 * `control-known-bytes.*` — CAN THIS INSTRUMENT SEE A KNOWN ALLOCATION. N
 * pre-sized references must come out at N times 4 or N times 8, the only two
 * answers a 64-bit V8 permits; a reading on neither VOIDS THE REPORT. PRE-SIZED
 * rather than pushed into, because `push` leaves capacity above length — an
 * unknown overshoot inside a control whose job is to be known. TWO SIZES: `1Mi`
 * sets the bytes-per-reference every claim row is read against, `128Ki` sits at
 * the scale of the claims and says the instrument resolves an allocation THAT
 * size. Both must land on the same platform constant.
 *
 * `control-noise.identical-populations` — THE FLOOR, IN BYTES. The same
 * population built by the same code in two processes, so the true delta is zero.
 * THE RULE THE WHOLE TABLE IS READ UNDER: no delta smaller than this gap is a
 * reading, in either direction. Deliberately built from plain objects and nothing
 * from the library — a floor that moved when the engine changed would be a floor
 * the engine's own rows could not be judged against. IT IS NOT THE ONLY FLOOR:
 * every claim row also carries its own, and a delta must clear both.
 */

const REFERENCES_LARGE = 1024 * 1024;
const REFERENCES_SMALL = 128 * 1024;

/** No third answer is possible: that is what makes this a control. */
export const BYTES_PER_REFERENCE_ALLOWED: readonly number[] = [4, 8];

/** Its reading sets the bytes-per-reference every row is read against. */
export const CONTROL_KNOWN_BYTES_LARGE = 'control-known-bytes.1Mi-references';
export const CONTROL_KNOWN_BYTES_SMALL = 'control-known-bytes.128Ki-references';
export const CONTROL_NOISE = 'control-noise.identical-populations';

/**
 * How far a known-size control may land from 4 or from 8 before the report is
 * void. The two answers are a factor of two apart, so anything below 0.5 cannot
 * confuse them, and a tenth still leaves room for the array header, the holder
 * and a settle that stopped a page early.
 */
export const KNOWN_BYTES_WITHIN = 0.1;

/**
 * The `off` arm builds the same object and an EMPTY array, so the delta is the
 * backing store and nothing else: target, holder and array header cancel.
 */
const referenceArray = (count: number): { readonly root: unknown; readonly rows: number } => {
    const target = { held: true };
    const array = new Array<{ held: boolean }>(count);
    for (let i = 0; i < count; i++) array[i] = target;
    return { root: { target, array }, rows: count };
};

/** `rows` is the pair's divisor, so it matches the `on` arm's. */
const emptyReferenceArray = (
    count: number,
): { readonly root: unknown; readonly rows: number } => {
    const target = { held: true };
    const array = new Array<{ held: boolean }>(0);
    return { root: { target, array }, rows: count };
};

/**
 * A HUNDRED THOUSAND, so the noise control's heap is the same order of magnitude
 * as the heaps the claim rows are measured on.
 */
const NOISE_ROWS = 100_000;

const noisePopulation = (): { readonly root: unknown; readonly rows: number } => {
    const rows: { id: string; group: string; rank: number; title: string; note: string }[] = [];
    for (let i = 0; i < NOISE_ROWS; i++) {
        rows.push({
            id: `row-${i}`,
            group: `group-${i % 64}`,
            rank: i,
            title: 'alpha',
            note: 'note',
        });
    }
    return { root: rows, rows: NOISE_ROWS };
};

export const retainedControls: readonly TRetainedPair[] = [
    {
        id: CONTROL_KNOWN_BYTES_LARGE,
        path: ERetainedPath.PerProcess,
        on: `a pre-sized array of ${REFERENCES_LARGE.toLocaleString('en-US')} references to one object`,
        off: 'the same object, and an empty array',
        isControl: true,
        expectedBytesPerRow: BYTES_PER_REFERENCE_ALLOWED,
        caveat:
            'NOT A RETENTION — an instrument check, printed first because nothing below it means ' +
            'anything until it passes, and the row that SETS the bytes-per-reference every claim ' +
            'in this table is read against. The true answer is known in advance and there are only ' +
            'two of it: a reference on 64-bit V8 is four bytes in a pointer-compressed build and ' +
            'eight without. The array is PRE-SIZED, not pushed into, so no growth overshoot is ' +
            'hiding in the capacity; the target object, the holder and the array header are on ' +
            'both arms and cancel. A reading that lands on neither 4 nor 8 means this process ' +
            'cannot reproduce an allocation arithmetic knows exactly, and the runner voids the ' +
            'report rather than printing deltas under it. NOTE FOR THE CLAIM ROWS: this control ' +
            'measures a pre-sized array and every claim row measures a GROWN one, so a claim row ' +
            'reading above this figure per row is the growth overshoot of `Array.prototype.push` ' +
            'and not a disagreement with this control.',
        build: arm =>
            arm === 'on' ? referenceArray(REFERENCES_LARGE) : emptyReferenceArray(REFERENCES_LARGE),
    },
    {
        id: CONTROL_KNOWN_BYTES_SMALL,
        path: ERetainedPath.PerProcess,
        on: `a pre-sized array of ${REFERENCES_SMALL.toLocaleString('en-US')} references to one object`,
        off: 'the same object, and an empty array',
        isControl: true,
        expectedBytesPerRow: BYTES_PER_REFERENCE_ALLOWED,
        caveat:
            'THE SAME CHECK AT THE SCALE OF THE CLAIMS, and that is the whole reason it exists ' +
            'beside the 1Mi row. Half a megabyte to a megabyte is the scale the claims on this ' +
            'table are about, so an instrument attested only at eight megabytes has been attested ' +
            'at the ' +
            'wrong scale — the question a reader has is not whether a large allocation is visible ' +
            'but whether one THIS size is. It must land on the same platform constant as the row ' +
            'above; if the two disagree, one of them is measuring something other than the ' +
            'references, and the report says so instead of choosing.',
        build: arm =>
            arm === 'on' ? referenceArray(REFERENCES_SMALL) : emptyReferenceArray(REFERENCES_SMALL),
    },
    {
        id: CONTROL_NOISE,
        path: ERetainedPath.PerProcess,
        on: `${NOISE_ROWS.toLocaleString('en-US')} plain rows in a plain array`,
        off: 'the same code, the same count, in another process',
        isControl: true,
        caveat:
            'NOT A RETENTION — THE NOISE FLOOR, IN BYTES. Both arms run the same builder over the ' +
            'same count, so the true delta is zero and everything printed here is two processes ' +
            'disagreeing about a heap they filled identically. THE RULE THAT FOLLOWS IS THE ONE ' +
            'THE WHOLE TABLE IS READ UNDER: no delta smaller than this gap is a reading, in either ' +
            'direction. It is deliberately NOT built out of the library — its job is to ' +
            'characterise the instrument and the process pair, and a floor that moved when the ' +
            'engine changed would be a floor the engine\'s own rows could not be judged against. ' +
            'A hundred thousand rows, so the heap it disagrees over is the same order of magnitude ' +
            'as the ones the claims are measured on. Every claim row additionally carries its OWN ' +
            'floor — its `off` arm built twice, once before the `on` arm and once after, over the ' +
            'real population — and the stricter of the two is the one that decides it.',
        build: () => noisePopulation(),
    },
];
