import { formatMs, formatPercent } from '../harness/measure';
import { scenarioByKey } from '../harness/scenarios';
import { QUALITY_TEXT } from './quality';
import { runCountOf, runCountText } from './runCount';
import type { TQualityIssue } from './quality';
import type { TScenarioTable, TTableRow } from './scenarioTables';
import { codeLinesOf, participantCodeVolumes } from '../lines/participantCodeVolume';
import { shapeOfScenario } from '../lines/wiringCodeVolume';

export const formatRatio = (ratio: number): string =>
    `${ratio >= 10 ? ratio.toFixed(0) : ratio >= 0.1 ? ratio.toFixed(2) : ratio.toPrecision(2)}×`;

const ratioText = (row: TTableRow): string =>
    row.measured.ratioToAnchor === undefined ? '' : formatRatio(row.measured.ratioToAnchor);

const flagsOf = (row: TTableRow): string =>
    [...row.stale.map(reason => `stale:${reason}`), ...row.issues].join(' ');

const rowLine = (row: TTableRow, codeLines: number | undefined): string => {
    const { measured } = row;
    const counters =
        `A ${measured.a.deliveries}d/${measured.a.distinct}n/${measured.a.redundant}r  ` +
        `B ${measured.b.deliveries}d/${measured.b.distinct}n/${measured.b.redundant}r`;
    return (
        `  ${(row.place === undefined ? '≈' : `#${row.place}`).padStart(4)} ${row.adapter.padEnd(18)}` +
        `${formatMs(measured.min).padStart(12)} ${ratioText(row).padStart(8)}  ` +
        `${codeLines === undefined ? '' : `${codeLines} loc`.padStart(8)}  ` +
        `drift ${formatPercent(measured.drift).padStart(6)}  ${runCountText(runCountOf(measured)).padEnd(18)}  ${counters}  ` +
        `${row.record.measuredAt.slice(0, 10)}  ${flagsOf(row)}`
    );
};

export const formatReport = (tables: readonly TScenarioTable[]): string => {
    const lines: string[] = [];
    const seenIssues = new Set<TQualityIssue>();
    const volumes = participantCodeVolumes();
    for (const table of tables) {
        const scenario = scenarioByKey(table.scenario);
        if (table.rows.length === 0 && table.problems.length === 0) continue;
        lines.push('', `── ${table.point} · ${scenario.label}  (${table.scenario})`, `   ${scenario.description}`, '');
        for (const row of table.rows) {
            lines.push(rowLine(row, codeLinesOf(volumes, row.adapter, shapeOfScenario(scenario))));
            for (const issue of row.issues) seenIssues.add(issue);
        }
        for (const problem of table.problems) lines.push(`     ${problem.adapter.padEnd(18)} ${problem.text}`);
        if (table.missing.length > 0) lines.push(`     not yet measured: ${table.missing.join(', ')}`);
        for (const { adapter, reason } of table.declined) {
            lines.push(`     declined by ${adapter}: ${reason.split('\n')[0].slice(0, 160)}`);
        }
    }
    lines.push(
        '',
        'ratio = this row ÷ the anchor (baseline-indexed, or baseline-array where it declines) measured in the SAME batch; rows are ordered by it.',
        'A place is printed only where a row stands clear of every row above it by more than the drift',
        "of both rows (plus each batch's anchor drift when the two came from different batches).",
        'Np×Ss×Rr=T = N processes, S samples each, R timed runs per sample, T timed runs in all; the time is the minimum sample',
        'd = deliveries, n = distinct renders, r = redundant renders',
        'loc = code lines this participant needed for this task (`npm run lines`)'
    );
    for (const issue of seenIssues) lines.push(`${issue}: ${QUALITY_TEXT[issue]}`);
    return lines.join('\n');
};
