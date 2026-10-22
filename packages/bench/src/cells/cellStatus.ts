import { SCENARIOS } from '../harness/scenarios';
import type { TScenario } from '../harness/types';
import type { CellStore } from './cellStore';
import { CURRENT_ENVIRONMENT, sameEnvironment } from './environment';
import type { IFingerprintSource } from './fingerprint';
import { declineOf, participantsOf } from './participants';
import { POINTS, sameScale } from './points';
import type { TCellRecord, TCellState, TCellStatus, TFingerprint, TPoint, TStaleReason } from './types';

export type TCellFilter = {
    points: readonly string[];
    scenarios: readonly string[];
    adapters: readonly string[];
};

const ANY: TCellFilter = { points: [], scenarios: [], adapters: [] };

const admits = (wanted: readonly string[], value: string): boolean =>
    wanted.length === 0 || wanted.includes(value);

const sameLibraries = (a: TFingerprint['libraries'], b: TFingerprint['libraries']): boolean => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (a[key] !== b[key]) return false;
    return true;
};

const staleReasonsOf = (
    record: TCellRecord,
    point: TPoint,
    current: TFingerprint,
    planId: string | undefined
): TStaleReason[] => {
    const reasons: TStaleReason[] = [];
    if (record.fingerprint.harness !== current.harness) reasons.push('harness');
    if (record.fingerprint.adapter !== current.adapter) reasons.push('adapter');
    if (record.fingerprint.subject !== current.subject) reasons.push('subject');
    if (!sameLibraries(record.fingerprint.libraries, current.libraries)) reasons.push('library');
    if (planId === undefined || JSON.stringify(record.plan) !== planId) reasons.push('plan');
    if (!sameScale(record.batch.point, point)) reasons.push('point');
    if (!sameEnvironment(record.environment, CURRENT_ENVIRONMENT)) reasons.push('environment');
    return reasons;
};

export const cellStatuses = async (
    store: CellStore,
    fingerprintSource: IFingerprintSource,
    filter: TCellFilter = ANY
): Promise<TCellStatus[]> => {
    const statuses: TCellStatus[] = [];
    for (const point of POINTS) {
        if (!admits(filter.points, point.key)) continue;
        for (const scenario of SCENARIOS) {
            if (!admits(filter.scenarios, scenario.key)) continue;
            const plan = store.planOf(point.key, scenario.key);
            const planId = plan === undefined ? undefined : JSON.stringify(plan.plan);
            for (const adapter of participantsOf(scenario)) {
                if (!admits(filter.adapters, adapter.name)) continue;
                statuses.push({
                    key: { point: point.key, scenario: scenario.key, adapter: adapter.name },
                    state: await stateOf(store, fingerprintSource, point, scenario, adapter.name, planId),
                });
            }
        }
    }
    return statuses;
};

const stateOf = async (
    store: CellStore,
    fingerprintSource: IFingerprintSource,
    point: TPoint,
    scenario: TScenario,
    adapterName: string,
    planId: string | undefined
): Promise<TCellState> => {
    const adapter = participantsOf(scenario).find(candidate => candidate.name === adapterName);
    const declined = adapter === undefined ? 'not a participant' : declineOf(adapter, scenario);
    if (declined !== undefined) return { status: 'declined', reason: declined };
    const record = store.cellOf(point.key, scenario.key, adapterName);
    if (record === undefined) return { status: 'missing' };
    const reasons = staleReasonsOf(record, point, await fingerprintSource.fingerprintOf(adapterName), planId);
    return reasons.length === 0 ? { status: 'fresh', record } : { status: 'stale', reasons, record };
};
