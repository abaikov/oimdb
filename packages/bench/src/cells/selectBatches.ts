import { isStoreless, scenarioByKey } from '../harness/scenarios';
import type { TScenario } from '../harness/types';
import type { CellStore } from './cellStore';
import { anchorFor, controlsFor } from './participants';
import { pointOf, withProcesses } from './points';
import { qualityIssuesOf } from './quality';
import type { TCellStatus, TPoint } from './types';

export type TSelection = 'due' | 'due-and-failed' | 'all';

export type TPlannedBatch = {
    point: TPoint;
    scenario: TScenario;
    adapterNames: readonly string[];
    estimatedSeconds: number;
};

const SPAWN_SECONDS = 1.5;
const WARMUP_SECONDS = 1;
const UNKNOWN_ADAPTER_SECONDS = 60;

export const isDue = (status: TCellStatus, selection: TSelection): boolean => {
    const { state } = status;
    if (state.status === 'declined') return false;
    if (selection === 'all') return true;
    if (state.status === 'missing' || state.status === 'stale') return true;
    if (selection === 'due') return false;
    const storeless = isStoreless(scenarioByKey(status.key.scenario));
    return state.record.outcome.status !== 'measured' || qualityIssuesOf(state.record, storeless).length > 0;
};

const recordedSecondsOf = (
    store: CellStore,
    point: TPoint,
    scenario: TScenario,
    adapterName: string
): number | undefined => {
    const previous = store.cellOf(point.key, scenario.key, adapterName);
    if (previous !== undefined) {
        const perAdapter = previous.batch.seconds / Math.max(1, previous.batch.adapterNames.length);
        return (perAdapter * point.processes) / Math.max(1, previous.batch.point.processes);
    }
    const planRecord = store.planOf(point.key, scenario.key);
    const runMs = planRecord?.probes.find(probe => probe.name === adapterName)?.runMs;
    if (planRecord === undefined || runMs === undefined) return undefined;
    const { repeat, samples } = planRecord.plan;
    const perProcess = SPAWN_SECONDS + WARMUP_SECONDS + (samples * repeat * runMs) / 1000;
    return SPAWN_SECONDS + point.processes * perProcess;
};

const adapterSecondsOf = (store: CellStore, point: TPoint, scenario: TScenario, adapterName: string): number => {
    const recorded = recordedSecondsOf(store, point, scenario, adapterName);
    if (recorded !== undefined) return recorded;
    const anchor = anchorFor(scenario);
    if (anchor !== undefined && controlsFor(scenario).includes(adapterName)) {
        return recordedSecondsOf(store, point, scenario, anchor) ?? UNKNOWN_ADAPTER_SECONDS;
    }
    return UNKNOWN_ADAPTER_SECONDS;
};

type TDueGroup = { point: TPoint; scenario: TScenario; adapterNames: string[] };

const dueGroupsOf = (
    statuses: readonly TCellStatus[],
    selection: TSelection,
    processes: number | undefined
): TDueGroup[] => {
    const groups = new Map<string, TDueGroup>();
    for (const status of statuses) {
        if (!isDue(status, selection)) continue;
        const id = `${status.key.point}--${status.key.scenario}`;
        let group = groups.get(id);
        if (group === undefined) {
            group = {
                point: withProcesses(pointOf(status.key.point), processes),
                scenario: scenarioByKey(status.key.scenario),
                adapterNames: [],
            };
            groups.set(id, group);
        }
        group.adapterNames.push(status.key.adapter);
    }
    return [...groups.values()];
};

export const planBatches = (
    statuses: readonly TCellStatus[],
    store: CellStore,
    budgetSeconds: number,
    selection: TSelection,
    processes?: number
): TPlannedBatch[] => {
    const batches: TPlannedBatch[] = [];
    let remaining = budgetSeconds;
    for (const { point, scenario, adapterNames } of dueGroupsOf(statuses, selection, processes)) {
        const anchor = anchorFor(scenario);
        const companions = [...controlsFor(scenario), ...(anchor === undefined ? [] : [anchor])].filter(
            name => !adapterNames.includes(name)
        );
        let estimate = companions.reduce((sum, name) => sum + adapterSecondsOf(store, point, scenario, name), 0);
        const taken: string[] = [];
        for (const adapterName of adapterNames) {
            const cost = adapterSecondsOf(store, point, scenario, adapterName);
            const firstOfTheRun = taken.length === 0 && batches.length === 0;
            if (!firstOfTheRun && estimate + cost > remaining) break;
            taken.push(adapterName);
            estimate += cost;
        }
        if (taken.length === 0) break;
        batches.push({ point, scenario, adapterNames: taken, estimatedSeconds: estimate });
        remaining -= estimate;
        if (remaining <= 0) break;
    }
    return batches;
};

export const estimateSeconds = (statuses: readonly TCellStatus[], store: CellStore, selection: TSelection): number =>
    planBatches(statuses, store, Number.POSITIVE_INFINITY, selection).reduce(
        (sum, batch) => sum + batch.estimatedSeconds,
        0
    );
