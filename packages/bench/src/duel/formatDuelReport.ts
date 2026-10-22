/**
 * TWO NUMBERS, THEIR RATIO, AND EVERY REASON THE RATIO MIGHT NOT BE ONE.
 *
 * The flag column is the price report's, deliberately and by import: `=` for a
 * claim no larger than the instrument's own disagreement, `≠` for noise past
 * `NOISE_VOIDS_THE_RATIO`, `~` for a spread over 30%, `L` for foreign load, `w`
 * for a warm-up shortfall. A second threshold invented here would let the same
 * machine void a row in one report and print it bare in the other, and a reader
 * would have no way to tell which to believe. The one mark that is this report's
 * own is `?`, for a run with fewer than two processes per arm: there the arms
 * have no drift, so the ratio has no error bar at all, which the price catalogue
 * cannot express because every pair there is bracketed by construction.
 *
 * WHAT IS PRINTED EVEN WHEN IT IS BORING. The floor's name and what it is. Where
 * the sampling plan came from. Whether the plan makes these milliseconds
 * comparable with a full-registry table. Whether the floor is shape-matched to
 * the arm. None of those change often, and a disclosure that only appears when
 * it is bad teaches a reader to skip the line it appears on.
 */
import {
    asColumns,
    formatFraction,
    formatMs,
    formatRatio,
    wrap,
    type TCells,
} from '../price/priceReportCells';
import { NOISE_VOIDS_THE_RATIO } from '../price/formatPriceReport';
/**
 * The two control names come from `harness/control.ts` rather than from the
 * registry that re-exports them: a formatter has no business importing sixteen
 * libraries to print two strings, and the registry imports every adapter — and
 * therefore every library and the working-tree core — at module load.
 */
import { CONTROL_HEAVY, CONTROL_LEAN } from '../harness/control';
import { ANCHOR_INDEXED } from '../harness/registry';
import { GROUPS } from '../harness/dataset';
import type { TMeasuredRecord } from '../harness/pieces';
import type { TDuelRun } from './TDuelRun';

/** The report's text width, the same one the price report folds to. */
const WIDTH = 96;

/**
 * WHAT THE FLOOR IS NOT MEASURED FOR — a CITATION, not a finding of this file.
 *
 * The consumer performs three property loads per visible row, and they land on
 * whatever shape the adapter hands over. `consumerFloor` in
 * `harness/scenarios.ts` names the shapes that are not plain objects, and this
 * is that list, kept here so the two-arm report can say on which arms the floor
 * is measuring a different shape from the arm beside it.
 *
 * IT ROTS THE WAY ANY CITATION ROTS. An adapter absent from it has NOT been
 * verified to store plain objects by anything here — the binding contract has no
 * way to ask an adapter for the rows it would hand a consumer without
 * delivering, which is exactly why the honest per-shape floor named in that
 * comment does not exist. Absence from this list is therefore "not known to
 * differ", and the report says so in those words rather than printing a tick.
 */
const SHAPES_THAT_ARE_NOT_PLAIN: ReadonlyMap<string, string> = new Map([
    ['mobx', 'a proxy'],
    ['tinybase', 'a pooled holder'],
    ['tanstack-db', 'a row carrying $synced / $origin / $key / $collectionId'],
    ['tanstack-db-eager', 'a row carrying $synced / $origin / $key / $collectionId'],
    ['lokijs', 'a document carrying $loki and meta'],
]);

/**
 * TWO VIEWS BY NAME, or fifty by their total — and the row says which.
 *
 * A per-group script has no view B to print: it is wired to one consumer per
 * group and the pair of counters it sends up is the SUM over all of them and an
 * empty slot. Printing that empty slot as `B 0d/0n/0r` would read as "the second
 * view never woke", which is a claim about a view that does not exist. The same
 * rule the full report's tables follow, for the same reason.
 */
const counters = (row: TMeasuredRecord, perGroup: boolean): string =>
    perGroup
        ? `${GROUPS} views ${row.a.deliveries}d/${row.a.distinct}n/${row.a.redundant}r`
        : `A ${row.a.deliveries}d/${row.a.distinct}n/${row.a.redundant}r  ` +
          `B ${row.b.deliveries}d/${row.b.distinct}n/${row.b.redundant}r`;

const paragraph = (lines: string[], text: string, indent: string): void => {
    for (const line of wrap(text, WIDTH - indent.length)) lines.push(`${indent}${line}`);
};

export const formatDuelReport = (run: TDuelRun): string => {
    const lines: string[] = [];
    const floorIsIndexed = run.floorName === ANCHOR_INDEXED.name;
    const floorIsHandWritten = run.floorIsNaive || floorIsIndexed;

    lines.push(`ONE TASK, TWO ARMS — ${run.armName.toUpperCase()} AGAINST THE FLOOR`);
    lines.push('');
    lines.push(`  arm     ${run.armName}`);
    lines.push(
        `  floor   ${run.floorName}${
            run.floorIsNaive
                ? ' — the naive hand-written floor: no library at all, a Map plus a full rescan per settle'
                : floorIsIndexed
                  ? ' — the hand-written anchor: no library, a bucket per group, a re-render only of the windows a write can change'
                  : ' — NOT a hand-written floor, so this is a comparison and not a floor'
        }`
    );
    if (run.floorIsNaive) {
        paragraph(
            lines,
            'It stores plain copies of the harness\'s own rows and re-derives every view on every ' +
                'settle that saw a write. It is deliberately not clever: making it smarter would make ' +
                'it a store. See packages/bench/src/adapters/baseline-array.ts.',
            '          '
        );
    }
    lines.push(`  task    ${run.scenarioLabel}  (${run.scenarioKey})`);
    paragraph(lines, run.scenarioDescription, '          ');
    lines.push(
        `  point   ${run.point.key}: ${run.point.n.toLocaleString()} rows, window ${run.point.window}, ${
            run.point.processes
        } process(es) per arm${run.steps === undefined ? '' : `, ${run.steps} step(s) per run`}`
    );
    lines.push(
        `  node    ${run.node}   ${run.load.cores} cores   ` +
            `foreign-load gate ${run.load.gate.toFixed(2)}   ` +
            `gc ${run.gcMissing ? 'NOT EXPOSED' : 'exposed'}`
    );
    lines.push(
        `  measured ${run.measuredAt} in ${run.seconds.toFixed(0)}s; load ${run.load.start.toFixed(2)} ` +
            `at start, peak ${run.load.peak.toFixed(2)} of ${run.load.readings} readings`
    );
    lines.push('');

    if (run.refusal !== undefined) {
        lines.push('REFUSED — nothing was measured.');
        paragraph(lines, run.refusal, '  ');
        paragraph(
            lines,
            'Raise the gate with BENCH_MAX_LOAD=<runnable processes> if you accept the interference; ' +
                'the number you accepted is printed above every run measured under it.',
            '  '
        );
        return lines.join('\n');
    }

    /* ── the instrument, before any number ──────────────────────────────── */

    lines.push('THE INSTRUMENT, BEFORE ANY NUMBER');
    lines.push('');

    const control = run.control;
    if (control === undefined && !run.controlsAsked) {
        lines.push(
            '  resolution     NOT ASKED — the resolution controls have no wiring for this script, so ' +
                'the cell runner times none either. The gap below is unattested.'
        );
    } else if (control === undefined) {
        lines.push(
            '  resolution     UNAVAILABLE — the control did not produce a number. The gap below is ' +
                'unattested.'
        );
    } else {
        lines.push(
            `  resolution     ${CONTROL_HEAVY} derives both views twice where ${CONTROL_LEAN} derives ` +
                `them once:`
        );
        lines.push(
            `                 ${formatMs(control.lean.min)} vs ${formatMs(control.heavy.min)} — ` +
                `${formatFraction(control.gap)} apart, drift ${formatFraction(control.drift)}`
        );
        // THE FULL RUNNER'S OWN CRITERION, not the price catalogue's 1.5x. That
        // number is priced against the price control's known ratio; this pair is
        // the harness's own derivation done once and twice, and `resolutionOf` in
        // `cells/runBatch.ts` asks of
        // it only that the gap it deliberately created be larger than the drift
        // the machine produced. Transplanting a threshold across two different
        // controls would be inventing one.
        if (control.gap <= control.drift) {
            paragraph(
                lines,
                'THIS RUN DID NOT RESOLVE A DIFFERENCE THE HARNESS PUT THERE ITSELF. It cannot be ' +
                    'trusted to see the ones it was not told about. Read nothing below as a result; ' +
                    'check what else is running and measure again.',
                '                 '
            );
        }
    }

    const oracle = run.answers.find(answer => answer.oracle !== undefined)?.oracle;
    if (run.voidReason === undefined) {
        lines.push(
            `  verification   both arms produced the reference model's answer: ${oracle ?? ''}`
        );
        lines.push(
            `                 compared as ${
                run.byFinalState
                    ? 'the FINAL STATE of both views — this script settles once after many writes, so ' +
                      'the render count is the store\'s answer and cannot also be its pass condition'
                    : 'the SEQUENCE of distinct states each view produced'
            }`
        );
    } else {
        lines.push('  verification   VOID');
        paragraph(lines, run.voidReason, '                 ');
        for (const answer of run.answers) {
            lines.push(
                `                   ${answer.name.padEnd(18)} ${
                    answer.problem ?? `${answer.signature}   model: ${answer.oracle}`
                }`
            );
        }
        paragraph(
            lines,
            'The model derives its views by filter/sort/slice over a plain Map and shares no ' +
                'derivation with any adapter, so this is not a tie between opinions. No timing is ' +
                'printed: an arm that did not do the work the script describes cannot be timed against ' +
                'one that did.',
            '                 '
        );
        lines.push('');
        return lines.join('\n');
    }
    lines.push('');

    /* ── the two numbers ────────────────────────────────────────────────── */

    const reading = run.reading;
    const plan = run.plan;
    if (reading === undefined || plan === undefined) {
        lines.push('NO READING — one of the two arms produced no time. See the problems below.');
        lines.push('');
        for (const problem of run.problems) lines.push(`  ${problem}`);
        return lines.join('\n');
    }

    lines.push(
        `THE TWO NUMBERS — ×${plan.repeat} runs per sample, ${plan.samples} samples, ` +
            `${plan.warmup} warm-up iterations, ${run.point.processes} process(es), one plan for both arms`
    );
    lines.push('');

    const rows: TCells[] = [['', 'min', 'spread', 'drift', 'deliveries']];
    for (const row of [reading.floor, reading.arm]) {
        rows.push([
            `${row.name}${row.name === run.floorName ? '  (floor)' : ''}`,
            formatMs(row.min),
            formatFraction(row.spread),
            formatFraction(row.drift),
            counters(row, run.perGroup),
        ]);
    }
    for (const line of asColumns(rows, [false, true, true, true, false]).split('\n')) {
        lines.push(`  ${line}`);
    }
    lines.push('');

    const claim = Math.abs(reading.ratio - 1);
    const marks: string[] = [];
    if (claim <= reading.noise) marks.push('=');
    if (reading.noise > NOISE_VOIDS_THE_RATIO) marks.push('≠');
    if (reading.arm.spread > 0.3 || reading.floor.spread > 0.3) marks.push('~');
    if (run.load.over) marks.push('L');
    if (
        (reading.arm.warmed ?? plan.warmup) < plan.warmup ||
        (reading.floor.warmed ?? plan.warmup) < plan.warmup
    ) {
        marks.push('w');
    }
    if (run.point.processes < 2) marks.push('?');

    lines.push(
        `  ${Array.from(new Set(marks)).join('').padEnd(4)}RATIO  ` +
            `${run.armName} / ${run.floorName} = ${formatRatio(reading.ratio)}  ± ${formatFraction(reading.noise)}`
    );
    paragraph(
        lines,
        reading.ratio >= 1
            ? `On this task the arm costs ${formatRatio(reading.ratio)} what the floor costs.`
            : `On this task the arm costs ${formatFraction(reading.ratio)} of what the floor costs${
                  run.floorIsNaive
                      ? ' — below the naive floor, which a floor that re-derives every view on every ' +
                        'settle makes possible.'
                      : floorIsIndexed
                        ? ' — below the hand-written anchor.'
                        : '.'
              }`,
        '        '
    );
    paragraph(
        lines,
        'The ± is the two arms\' drifts ADDED, not the larger of them: the ratio is a quotient and ' +
            'the relative errors of its halves add. Each drift is that arm\'s own code disagreeing ' +
            'with itself across independent processes. BOTH sides are bracketed here — the price ' +
            'catalogue brackets its floor and, since the `ours` re-check, its own side too.',
        '        '
    );
    lines.push('');
    lines.push('  =  the claim is no larger than the instrument\'s own disagreement. Not a reading.');
    lines.push(
        `  ≠  the two arms disagreed with themselves by more than ` +
            `${NOISE_VOIDS_THE_RATIO * 100}% in total across processes.`
    );
    lines.push('     Each arm\'s milliseconds are still readings; the ratio divides by a denominator');
    lines.push('     this machine never settled on, and is not.');
    lines.push('  ~  the spread inside a process exceeded 30%: the machine was busy, not the code.');
    lines.push('  L  foreign load rose above the gate while this run was measured.');
    lines.push('  w  an arm reached the warm-up ceiling before the planned count and entered the clock');
    lines.push('     at a lower V8 tier than the other.');
    lines.push('  ?  fewer than two processes per arm, so neither arm has a drift and the ratio has NO');
    lines.push('     error bar. Nothing above the noise marks was checked.');
    lines.push('');

    /* ── what this run is not ───────────────────────────────────────────── */

    lines.push('WHAT THIS RUN IS AND IS NOT');
    lines.push('');

    const source = run.planSource;
    if (source !== undefined && source.kind === 'borrowed') {
        lines.push('  plan     BORROWED from the cell runner\'s stored plan:');
        lines.push(
            `           ${source.pointKey}/${source.scenario}, probed ${source.probedAt}, priced ` +
                `across ${source.participants} participant(s).`
        );
        paragraph(
            lines,
            'Only the plan was read out of it — no time, no digest, no place. The ESTIMATOR is ' +
                'therefore the one every stored cell of this scenario was timed under, so these ' +
                'milliseconds may be read beside those cells. The machine and the moment are not: ' +
                'interference is a property of when a thing was measured, and it was measured now. ' +
                'The plan is kept across edits to the subject on purpose: holding the estimator ' +
                'still WHILE the subject changes is what a before-and-after check needs.',
            '           '
        );
    } else {
        const costs = source === undefined ? [] : source.kind === 'derived' ? source.costs : [];
        lines.push('  plan     DERIVED FROM THESE TWO ARMS ALONE — so these milliseconds are NOT');
        lines.push('           comparable with a full-registry table of the same scenario.');
        paragraph(
            lines,
            'The plan is derived ACROSS THE PARTICIPANT SET: `repeat` and `warmup` from the MEDIAN ' +
                'probe, `samples` from the SLOWEST (`planFor` in harness/measure.ts, as ' +
                '`cells/runBatch.ts` calibrates). A set of ' +
                'two prices both from itself — and a median of two is their MEAN, so the ' +
                'outlier-immunity a median is chosen for is doing no work here. Run with --borrow-plan ' +
                'to take the plan the cell runner stored for this scenario and point instead.',
            '           '
        );
        if (costs.length > 0) {
            lines.push(
                `           probes: ${costs
                    .map(cost => `${cost.name} ${formatMs(cost.runMs)}/run`)
                    .join(', ')}`
            );
        }
        paragraph(
            lines,
            'THE RATIO SURVIVES IT. Both arms were measured under ONE plan whatever that plan is, in ' +
                'one interleaved batch, on one machine, in one sitting — which is the only property ' +
                'the comparison rests on.',
            '           '
        );
    }
    lines.push('');

    lines.push('  drift    A batch of four names rather than eighteen means a shorter round, so the');
    lines.push('           interval each arm\'s drift covers is shorter than a full run\'s — which makes');
    lines.push('           drift SMALLER and the ± above TIGHTER, in the one direction that flatters a');
    lines.push('           difference. Read the ± as a floor on the error, not a ceiling.');
    lines.push('');

    if (floorIsHandWritten) {
        const notPlain = SHAPES_THAT_ARE_NOT_PLAIN.get(run.armName);
        lines.push('  shape    The consumer performs three property loads per visible row, and they land');
        lines.push('           on whatever shape each side hands over. The floor hands over plain row');
        lines.push('           objects, so the floor is a floor FOR THAT SHAPE.');
        if (notPlain === undefined) {
            paragraph(
                lines,
                `${run.armName} is not among the arms recorded as storing something else, so nothing ` +
                    'here says the two shapes differ — and nothing here VERIFIED that they match ' +
                    'either. The binding contract has no way to ask an adapter for the rows it would ' +
                    'hand a consumer without delivering, which is why the per-shape floor named in ' +
                    '`consumerFloor` (harness/scenarios.ts) does not exist. Treat this as "not known ' +
                    'to differ".',
                '           '
            );
        } else {
            paragraph(
                lines,
                `${run.armName} HANDS OVER ${notPlain.toUpperCase()}, so the floor is NOT ` +
                    'shape-matched to this arm: part of the ratio above is three property loads on one ' +
                    'shape against three on another, and this run cannot say how much. Cited from ' +
                    '`consumerFloor` in harness/scenarios.ts.',
                '           '
            );
        }
        lines.push('');
        paragraph(
            lines,
            'NOT the `consumerFloor` SCENARIO. That row is calibrated in one named adapter\'s process ' +
                'over plain harness objects and measures deliveries of a window and nothing else. This ' +
                'floor runs THE SAME SCRIPT as the arm, in its own processes, verified against the same ' +
                'reference model — which is what makes the ratio a statement about this task.',
            '           '
        );
        lines.push('');
    }

    if (run.problems.length > 0) {
        lines.push('PROBLEMS');
        lines.push('');
        for (const problem of run.problems) lines.push(`  ${problem}`);
        lines.push('');
    }

    return lines.join('\n');
};
