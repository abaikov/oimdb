import { SPREAD_CEILING } from '../harness/measure';
import { isStoreless, scenarioByKey } from '../harness/scenarios';
import type { TScenarioKey } from '../harness/types';
import { qualityIssuesOf } from './quality';
import type { TQualityIssue } from './quality';
import type { TCellRecord, TCellStatus, TMeasuredOutcome, TPointKey, TStaleReason } from './types';

export type TTableRow = {
    adapter: string;
    record: TCellRecord;
    measured: TMeasuredOutcome;
    stale: readonly TStaleReason[];
    issues: readonly TQualityIssue[];
    place: number | undefined;
};

export type TTableProblem = {
    adapter: string;
    text: string;
};

export type TScenarioTable = {
    point: TPointKey;
    scenario: TScenarioKey;
    rows: readonly TTableRow[];
    problems: readonly TTableProblem[];
    declined: readonly { adapter: string; reason: string }[];
    missing: readonly string[];
};

const keyOf = (row: TTableRow): number => row.measured.ratioToAnchor ?? row.measured.min;

const toleranceOf = (row: TTableRow): number =>
    row.measured.drift + (row.record.batch.anchor?.drift ?? 0);

const separated = (lower: TTableRow, upper: TTableRow): boolean => {
    const low = keyOf(lower);
    if (low <= 0) return false;
    const sameBatch = lower.record.batch.id === upper.record.batch.id;
    const tolerance = sameBatch
        ? Math.max(lower.measured.drift, upper.measured.drift)
        : Math.max(toleranceOf(lower), toleranceOf(upper));
    return (keyOf(upper) - low) / low > tolerance;
};

const placed = (rows: TTableRow[]): TTableRow[] => {
    rows.sort((a, b) => keyOf(a) - keyOf(b));
    return rows.map((row, index) => ({
        ...row,
        place:
            row.measured.spread <= SPREAD_CEILING && rows.slice(0, index).every(above => separated(above, row))
                ? index + 1
                : undefined,
    }));
};

export const scenarioTables = (statuses: readonly TCellStatus[]): TScenarioTable[] => {
    const grouped = new Map<string, TCellStatus[]>();
    for (const status of statuses) {
        const id = `${status.key.point}--${status.key.scenario}`;
        const group = grouped.get(id) ?? [];
        group.push(status);
        grouped.set(id, group);
    }
    const tables: TScenarioTable[] = [];
    for (const group of grouped.values()) {
        const { point, scenario } = group[0].key;
        const storeless = isStoreless(scenarioByKey(scenario));
        const rows: TTableRow[] = [];
        const problems: TTableProblem[] = [];
        const declined: { adapter: string; reason: string }[] = [];
        const missing: string[] = [];
        for (const { key, state } of group) {
            if (state.status === 'declined') {
                declined.push({ adapter: key.adapter, reason: state.reason });
                continue;
            }
            if (state.status === 'missing') {
                missing.push(key.adapter);
                continue;
            }
            const { record } = state;
            const outcome = record.outcome;
            if (outcome.status === 'disagrees') {
                problems.push({
                    adapter: key.adapter,
                    text: `disagrees with the reference model: ${outcome.signature} against ${outcome.oracle}`,
                });
                continue;
            }
            if (outcome.status === 'failed') {
                problems.push({ adapter: key.adapter, text: `failed in ${outcome.phase}: ${outcome.reason}` });
                continue;
            }
            rows.push({
                adapter: key.adapter,
                record,
                measured: outcome,
                stale: state.status === 'stale' ? state.reasons : [],
                issues: qualityIssuesOf(record, storeless),
                place: undefined,
            });
        }
        tables.push({ point, scenario, rows: placed(rows), problems, declined, missing });
    }
    return tables;
};
