import type { TAdapter } from './types';
import { jotaiAdapter } from '../adapters/jotai';
import { legendStateAdapter } from '../adapters/legend-state';
import { lokiAdapter } from '../adapters/lokijs';
import { effectorAdapter } from '../adapters/effector';
import { mobxAdapter } from '../adapters/mobx';
import { nanostoresAdapter } from '../adapters/nanostores';
import { alienSignalsAdapter } from '../adapters/alien-signals';
import { oimdbAdapter } from '../adapters/oimdb';
import { preactSignalsAdapter } from '../adapters/preact-signals';
import { reduxToolkitAdapter } from '../adapters/redux-toolkit';
import { signaldbAdapter } from '../adapters/signaldb';
import { tanstackDbAdapter } from '../adapters/tanstack-db';
import { tinybaseAdapter } from '../adapters/tinybase';

/**
 * Order is presentation order in the report.
 *
 * `@tanstack/table-core` is deliberately NOT here. It is a headless VIEW layer over an array the
 * caller owns — no storage, no subscriptions, no writes — so putting it beside stores invited a
 * comparison that cannot mean anything, and the rows it did produce (a 10-second "ordered insert")
 * measured a usage nobody writes rather than the library. The adapter file is kept for reference;
 * it is not run.
 */
export const ADAPTERS: TAdapter[] = [
    oimdbAdapter,
    tinybaseAdapter,
    signaldbAdapter,
    tanstackDbAdapter,
    lokiAdapter,
    jotaiAdapter,
    legendStateAdapter,
    mobxAdapter,
    effectorAdapter,
    nanostoresAdapter,
    reduxToolkitAdapter,
    // Reference only — signal libraries, no storage. They appear in the reactive-graph rows and
    // are `n/a` everywhere else, which is what they are rather than what was skipped.
    preactSignalsAdapter,
    alienSignalsAdapter,
];

export const adapterByName = (name: string): TAdapter => {
    const adapter = ADAPTERS.find(a => a.name === name);
    if (!adapter) throw new Error(`Unknown adapter: ${name}`);
    return adapter;
};

/**
 * `DEFAULT_REPEAT_CAP` applies to every timed scenario that does not set its own.
 *
 * A scenario whose single pass takes tens of microseconds is not a measurement: V8 has not left its
 * warm-up tiers by the time it ends, so the figure is JIT state rather than code. Measured directly
 * — 1,000 cached faceted reads came out at 476 ns each inside the harness and 66 ns each when run
 * long enough to settle, a 7x distortion, and it fell unevenly across libraries. The worker scales
 * the count down from this cap so each sample lands near 50 ms of steady-state work.
 *
 * The cap must be high enough that the SCALING can actually reach 50 ms. A cap of 1,000 on a 500 ns
 * operation pins the sample at half a millisecond — V8 never leaves its warm-up tiers, the spread
 * blows out past 2.0, and the figure lands ~2.5x above what the same code does once settled. Set it
 * from the fastest operation worth measuring (~250 ns), not from a round number.
 *
 * `noRepeat` marks a scenario whose `run()` cannot be called twice against one `setup()`: `load` and
 * `orderedInsert` INSERT. Repeating them is wrong in two different ways — LokiJS throws on the
 * duplicate id, while an upsert-based store silently measures "write into an already-full store"
 * for every pass after the first and comes out looking faster than it is. The loud failure is the
 * lucky case; this flag exists because of the quiet one.
 */
export const DEFAULT_REPEAT_CAP = 200_000;

/**
 * Every scenario, in report order, with the label the report prints. `counter` names the extra
 * number a scenario reports beside its time (how many subscribers woke, how many effects ran).
 *
 * `repeat` exists because a scenario whose `run` performs ONE operation cannot be timed: a single
 * write costs a few hundred nanoseconds, which is the same order as the timer call and the setup
 * around it, so the reported figure is mostly measurement overhead. Those scenarios are executed
 * `repeat` times per sample and the result divided back down to a per-operation cost.
 */
export const SCENARIOS = [
    { key: 'taskTable', label: 'task: table', unsupported: 'no filter/sort/page path' },
    { key: 'taskFeedPush', label: 'task: feed push', unsupported: 'no per-row subscription', counter: 'woken' },
    { key: 'taskDetailCard', label: 'task: detail card', unsupported: 'no relation mechanism' },
    { key: 'taskFacetSearch', label: 'task: facet search', unsupported: 'no multi-field lookup' },
    { key: 'load', label: 'load', unsupported: 'no bulk insert', noRepeat: true },
    { key: 'readByPk', label: 'read by pk', unsupported: 'no primary-key lookup' },
    { key: 'queryColdByField', label: 'query cold', unsupported: 'no field query' },
    { key: 'queryHotByField', label: 'query hot', unsupported: 'no field query' },
    { key: 'queryCachedByField', label: 'query cached', unsupported: 'no memoising primitive' },
    { key: 'queryHotKeysOnly', label: 'query hot (keys only)', unsupported: 'cannot answer without building rows' },
    { key: 'facetedFilter', label: 'faceted filter', unsupported: 'no multi-field lookup' },
    { key: 'relatedLookup', label: 'related lookup', unsupported: 'no relation mechanism' },
    { key: 'computedChain', label: 'computed chain', unsupported: 'no derived-value primitive' },
    { key: 'orderedInsert', label: 'ordered insert', unsupported: 'no ordered structure', noRepeat: true },
    { key: 'subscriptionChurn', label: 'subscription churn', unsupported: 'no per-entity subscription' },
    { key: 'pointUpdate', label: 'point update', unsupported: 'no per-entity subscription', counter: 'woken', repeat: 200_000 },
    { key: 'effectDispatch', label: 'effect dispatch', unsupported: 'no effect primitive', counter: 'ran', repeat: 200_000 },
    { key: 'batchUpdate', label: 'batch update (10%)', unsupported: 'no bulk write', counter: 'woken' },
    { key: 'burstCoalescing', label: 'burst (same rows)', unsupported: 'no per-entity subscription', counter: 'woken' },
    { key: 'fanOutRecompute', label: 'graph: fan-out', unsupported: 'no derived-value primitive', reactive: true, repeat: 200_000 },
    { key: 'diamondGlitch', label: 'graph: diamond', unsupported: 'no derived-value primitive', reactive: true, repeat: 200_000 },
    { key: 'deepGraphGlitch', label: 'graph: deep diamond', unsupported: 'no derived-value primitive', reactive: true, repeat: 200_000 },
    { key: 'unrelatedFieldWakeups', label: 'graph: dep granularity', unsupported: 'no derived-value primitive', reactive: true, repeat: 200_000 },
    { key: 'memoryForEntities', label: 'memory: entities', unsupported: 'no store', memory: true },
    { key: 'memoryForSubscriptions', label: 'memory: + subscriptions', unsupported: 'no per-entity subscription', memory: true },
] as const;

export type TScenarioKey = (typeof SCENARIOS)[number]['key'];
