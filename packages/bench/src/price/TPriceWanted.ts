/**
 * WHICH SIDE OF A PAIR THIS PROCESS EXISTS TO MEASURE.
 *
 * `'both'`: one process times floor, ours, floor again; the two floor readings
 * bracket everything that drifted in between.
 *
 * `'ours'` / `'floor'`: for a pair declaring `isolate` — see
 * {@link TPricePair.isolate}. Such a pair must BUILD only the side it was asked
 * for; populating the other design already teaches V8 its shape, so declining to
 * TIME it is not enough.
 */
export type TPriceWanted = 'both' | 'ours' | 'floor';
