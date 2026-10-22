import { ADAPTERS } from '../harness/registry';
import { isStoreless, scenarioByKey } from '../harness/scenarios';
import { formatDuration } from './formatDuration';
import { qualityIssuesOf } from './quality';
import type { TCellStatus } from './types';

const SYMBOL = {
    fresh: '●',
    flawed: '◍',
    failed: '✗',
    stale: '◐',
    missing: '○',
    declined: '·',
    absent: ' ',
} as const;

const symbolOf = (status: TCellStatus | undefined): string => {
    if (status === undefined) return SYMBOL.absent;
    const { state } = status;
    if (state.status === 'declined') return SYMBOL.declined;
    if (state.status === 'missing') return SYMBOL.missing;
    if (state.status === 'stale') return SYMBOL.stale;
    if (state.record.outcome.status !== 'measured') return SYMBOL.failed;
    const storeless = isStoreless(scenarioByKey(status.key.scenario));
    return qualityIssuesOf(state.record, storeless).length > 0 ? SYMBOL.flawed : SYMBOL.fresh;
};

export const formatStatus = (statuses: readonly TCellStatus[], remainingSeconds: number): string => {
    const lines: string[] = [];
    const names = ADAPTERS.map(adapter => adapter.name);
    const columns = names.map((_, index) => String(index + 1).padStart(2)).join('');
    const counts = new Map<string, number>();
    for (const status of statuses) {
        const symbol = symbolOf(status);
        counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }

    const points = [...new Set(statuses.map(status => status.key.point))];
    for (const point of points) {
        lines.push('', `${point}`, `  ${''.padEnd(26)}${columns}`);
        const scenarios = [...new Set(statuses.filter(s => s.key.point === point).map(s => s.key.scenario))];
        for (const scenario of scenarios) {
            const row = names
                .map(name =>
                    symbolOf(
                        statuses.find(
                            s => s.key.point === point && s.key.scenario === scenario && s.key.adapter === name
                        )
                    ).padStart(2)
                )
                .join('');
            lines.push(`  ${scenario.padEnd(26)}${row}`);
        }
    }

    lines.push('', 'participants');
    names.forEach((name, index) => lines.push(`  ${String(index + 1).padStart(2)} ${name}`));
    lines.push(
        '',
        `${SYMBOL.fresh} fresh  ${SYMBOL.flawed} fresh, flawed  ${SYMBOL.failed} failed or disagrees  ` +
            `${SYMBOL.stale} stale  ${SYMBOL.missing} missing  ${SYMBOL.declined} declined  (blank: not asked)`,
        Object.entries(SYMBOL)
            .filter(([, symbol]) => (counts.get(symbol) ?? 0) > 0)
            .map(([word, symbol]) => `${word} ${counts.get(symbol)}`)
            .join(' · '),
        `due: about ${formatDuration(remainingSeconds)} of measuring, estimated from previous batches and probes`
    );
    return lines.join('\n');
};
