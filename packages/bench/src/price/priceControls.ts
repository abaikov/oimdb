// Prose: ./README.md#pricecontrols
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

/** Power of two, so the index wrap below is a mask and not a division. */
const WORK_LENGTH = 4096;

const makeWorkSide = (unitsPerIteration: number): TPriceSide => {
    const data = new Float64Array(WORK_LENGTH);
    for (let i = 0; i < WORK_LENGTH; i++) data[i] = i * 0.7 + 1;
    let accumulated = 0;

    const unit = (at: number): void => {
        let value = data[at & (WORK_LENGTH - 1)];
        for (let step = 0; step < 16; step++) value = value * 1.0000001 + 0.5;
        accumulated += value;
    };

    return {
        reset: () => undefined,
        run: times => {
            for (let i = 0; i < times; i++) {
                for (let u = 0; u < unitsPerIteration; u++) unit(i + u);
            }
            priceSink.number = accumulated;
        },
    };
};

export const CONTROL_RESOLUTION = 'control-resolution-2x';
export const CONTROL_SCALE = 'control-scale-same-body';
export const RESOLUTION_AT_LEAST = 1.5;

export const SCALE_ERROR_BANNERS_THE_RUN = 0.05;

export const CLAIM_MUST_OUTRUN_SCALE_ERROR_BY = 3;

/**
 * THE `±` RULE ITSELF, in one place because both reports apply it.
 *
 * The lower bound is NOT redundant: below the error a row is already `=`, the
 * stronger sentence, so `±` claims only the band where a row CLEARS the error
 * and prints bare. `claim` is `|ratio - 1|`, `scaleError` is
 * `|scale control ratio - 1|`.
 */
export const scaleErrorEatsTheClaim = (claim: number, scaleError: number): boolean =>
    claim > scaleError && claim < CLAIM_MUST_OUTRUN_SCALE_ERROR_BY * scaleError;

export const priceControls: readonly TPricePair[] = [
    {
        id: CONTROL_RESOLUTION,
        path: EPricePath.PerRead,
        ours: 'two units of arithmetic per iteration',
        floor: 'one unit of arithmetic per iteration',
        caveat:
            'NOT A PRICE — an instrument check, and it is printed first because nothing below it ' +
            'means anything until it passes. The true ratio is a little UNDER 2: both sides pay ' +
            'the driving loop once, so the exact expectation is (2u + L) / (u + L) with L the ' +
            'loop and u one unit, which at sixteen dependent steps per unit puts it around 1.9. ' +
            'A reading below 1.5 means this process could not resolve a deliberate doubling, and ' +
            'the runner voids the report rather than printing prices under it.',
        build: () => ({
            ours: makeWorkSide(2),
            floor: makeWorkSide(1),
        }),
    },
    {
        id: CONTROL_SCALE,
        path: EPricePath.PerRead,
        ours: 'one unit of arithmetic per iteration',
        floor: 'the same body again, over its own copy of the same state',
        caveat:
            'NOT A PRICE — the noise floor. The two sides are identical code over identical, ' +
            'separately-allocated state, so the true ratio is 1.00 exactly and every departure ' +
            'from it printed here was produced by this machine at this moment. The rule that ' +
            'follows is the one the whole table is read under: NO RATIO CLOSER TO 1.00 THAN THIS ' +
            'GAP IS A READING. It also bounds the per-row noise figure, which is the same idea ' +
            'measured again inside every pair — each pair times its floor twice, once before our ' +
            'side and once after, and prints how far the two disagreed.',
        build: () => ({
            ours: makeWorkSide(1),
            floor: makeWorkSide(1),
        }),
    },
];
