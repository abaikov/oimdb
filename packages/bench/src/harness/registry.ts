import type { TAdapter, TExcludedLibrary, TWiring } from './types';
import { CHURN_SHAPES, READ_SHAPES } from './types';
import { alienSignalsAdapter } from '../adapters/alien-signals';
import { baselineArrayAdapter } from '../adapters/baseline-array';
import { baselineArrayIndexedAdapter } from '../adapters/baseline-array-indexed';
import { effectorAdapter } from '../adapters/effector';
import { jotaiAdapter } from '../adapters/jotai';
import { legendStateAdapter } from '../adapters/legend-state';
import { lokiAdapter } from '../adapters/lokijs';
import { mobxAdapter } from '../adapters/mobx';
import { nanostoresAdapter, nanostoresPerRowAdapter } from '../adapters/nanostores';
import { oimdbAdapter, oimdbSortedIndexAdapter } from '../adapters/oimdb';
import { oimdbLegacyAdapter } from '../adapters/oimdb-legacy';
import { preactSignalsAdapter } from '../adapters/preact-signals';
import { reduxToolkitAdapter } from '../adapters/redux-toolkit';
import { signaldbAdapter } from '../adapters/signaldb';
import { tanstackDbAdapter, tanstackDbEagerAdapter, tanstackDbIndexedAdapter } from '../adapters/tanstack-db';
import { tanstackTableExclusion } from '../adapters/tanstack-table';
import { tinybaseAdapter } from '../adapters/tinybase';
import { zustandAdapter } from '../adapters/zustand';
import { valtioAdapter } from '../adapters/valtio';
import { xstateStoreAdapter } from '../adapters/xstate-store';
import { vueReactivityAdapter } from '../adapters/vue-reactivity';
import { solidSignalsAdapter } from '../adapters/solid-signals';
import { tanstackStoreAdapter } from '../adapters/tanstack-store';
import { controlHeavyAdapter, controlLeanAdapter, controlWriteAdapter } from './control';

/**
 * Presentation order. THE TWO ANCHORS ARE FIRST AND TOGETHER: every other number is
 * read against them, and the gap BETWEEN them is itself a result — the price of a
 * group index, measured on the same scripts at the same point.
 *
 * TWO ROWS OF ONE LIBRARY, TWICE OVER, because a configuration is not a footnote.
 * Each row of a pair is a full row — its own processes, the same reference
 * model, the same population audit. Nothing about being half of a pair exempts a
 * row from anything.
 */
export const ADAPTERS: readonly TAdapter[] = [
    baselineArrayAdapter,
    baselineArrayIndexedAdapter,
    oimdbAdapter,
    oimdbSortedIndexAdapter,
    oimdbLegacyAdapter,
    tinybaseAdapter,
    signaldbAdapter,
    tanstackDbAdapter,
    tanstackDbEagerAdapter,
    tanstackDbIndexedAdapter,
    lokiAdapter,
    mobxAdapter,
    jotaiAdapter,
    legendStateAdapter,
    effectorAdapter,
    nanostoresAdapter,
    nanostoresPerRowAdapter,
    reduxToolkitAdapter,
    preactSignalsAdapter,
    alienSignalsAdapter,
    zustandAdapter,
    valtioAdapter,
    xstateStoreAdapter,
    vueReactivityAdapter,
    solidSignalsAdapter,
    tanstackStoreAdapter,
];

/**
 * Libraries deliberately NOT measured, printed once above the report. The rule they
 * fail is stated on `TExcludedLibrary`. A library missing with no line here would
 * be a fact about whoever wrote the adapters; a library named here is a fact about
 * the library.
 */
export const EXCLUDED: readonly TExcludedLibrary[] = [tanstackTableExclusion];

/**
 * Whose process the consumer lower bound is measured in — and therefore WHOSE
 * STORAGE SHAPE it is a bound for.
 *
 * Named rather than `ADAPTERS[0]` because the choice is load-bearing: the scenario
 * renders plain objects, the cheapest shape any adapter here stores and the shape
 * oimdb's adapter stores. See `consumerFloor` before subtracting the number.
 *
 * It is not the ratio anchor (`cells/participants.ts` `anchorFor`): the bound is a
 * bound for a STORAGE SHAPE, and both hand-written participants store plain objects.
 */
export const FLOOR_ADAPTER: TAdapter = baselineArrayAdapter;

/**
 * THE TWO ANCHORS, named as a pair so nothing has to find them by string. `lean`
 * keeps no group index and rescans; `indexed` keeps one and re-renders only the
 * windows a write can change (see `adapters/baseline-array-indexed.md`).
 */
export const ANCHOR_LEAN: TAdapter = baselineArrayAdapter;
export const ANCHOR_INDEXED: TAdapter = baselineArrayIndexedAdapter;

/**
 * THE RESOLUTION CONTROL — bodies of code with a difference the harness knows about
 * in advance. See `control.ts`.
 */
export const CONTROLS: readonly TAdapter[] = [
    controlLeanAdapter,
    controlHeavyAdapter,
    // THE FINE ARM, and the reason there are three rather than two: lean/heavy
    // attests a doubled DERIVATION, far larger than the gaps the tables ask a
    // reader to read and on an axis most rows do not vary along. See `control.ts`.
    controlWriteAdapter,
];

export const ALL_ADAPTERS: readonly TAdapter[] = [...ADAPTERS, ...CONTROLS];

/**
 * EXACTLY ONE HALF OF EVERY WIRING DECLARATION IS SET, and it is checked here
 * rather than trusted.
 *
 * A `TWiring` is two fields that have to agree: a builder, or a line saying why
 * there is none. Both set means a wiring AND an excuse printed above the same
 * table; neither set means a library missing from that table with nothing said
 * about it. Neither is expressible in the type, so it is a throw at module load,
 * in every process, before anything is measured.
 *
 * ASKED PER SHAPE, not per family: `churn` is four declarations and `reads` is
 * three, so an adapter that supplies three churn shapes and declines the fourth
 * is checked on each of the four separately — which is the whole point of the
 * split.
 */
const checkWiring = (
    adapterName: string,
    field: string,
    wiring: TWiring<unknown>
): void => {
    const wired = wiring.build !== undefined;
    const excused = wiring.absent.length > 0;
    if (wired === excused) {
        throw new Error(
            `${adapterName}: exactly one of \`${field}.build\` and \`${field}.absent\` must be set, ` +
                `and this adapter sets ${wired ? 'both' : 'neither'}. An adapter with that wiring ` +
                'needs no excuse; one without owes the reader the reason.'
        );
    }
};

for (const adapter of [...ADAPTERS, ...CONTROLS]) {
    for (const shape of CHURN_SHAPES) {
        checkWiring(adapter.name, `churn.${shape}`, adapter.churn[shape]);
    }
    for (const shape of READ_SHAPES) {
        checkWiring(adapter.name, `reads.${shape}`, adapter.reads[shape]);
    }
    // Two rows are driven by `relations.build`, and one declaration covers both.
    checkWiring(adapter.name, 'relations', adapter.relations);
    /**
     * THE ADMISSION RULE, ASKED OF EVERY ROW RATHER THAN OF THE ONE IT EXCLUDES.
     *
     * `TExcludedLibrary`'s rule — a library is measured here when it OWNS THE DATA
     * and emits a CHANGE SIGNAL for it — was never asked of the rows that passed. A
     * rule tested only on the row it rejects cannot be checked by a reader. The
     * type forces an answer; this throw stops the answer being blank. The strings
     * are printed together above the tables, beside the exclusion.
     */
    if (adapter.admission.trim().length === 0) {
        throw new Error(
            `${adapter.name}: \`admission\` is empty. Every row in this comparison has to say where ` +
                'its values live and what emits the change signal that drives the consumer — the same ' +
                'rule `tanstack-table` is excluded under. A blank answer would leave the rule applied ' +
                'to the one row it rejects and to nobody it admits.'
        );
    }
}

export const adapterByName = (name: string): TAdapter => {
    const found = ALL_ADAPTERS.find(adapter => adapter.name === name);
    if (found === undefined) throw new Error(`Unknown adapter: ${name}`);
    return found;
};

/** Rows in the dataset, unless told otherwise. */
export const DEFAULT_N = 10_000;

/**
 * How many separate PROCESSES measure each (adapter, scenario) pair.
 *
 * A process that lands in a bad JIT or GC state stays there for its whole life, so
 * a single process gives a number that is stable and wrong. The minimum across
 * independent processes is the cheapest defence.
 */
export const PROCESSES_PER_VARIANT = Number(process.env.BENCH_PROCESSES ?? 3);

export { CONTROL_HEAVY, CONTROL_LEAN, CONTROL_WRITE } from './control';
