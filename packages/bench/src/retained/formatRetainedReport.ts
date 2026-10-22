import { ownAllowanceText } from '../harness/load';
import { asColumns, formatBytes, wrap, type TCells } from '../price/priceReportCells';
import { attestRetainedRun } from './attestRetainedRun';
import type { TRetainedArmReading } from './TRetainedArmReading';
import type { TRetainedRecord } from './TRetainedRecord';

/**
 * THE WHOLE REPORT, AS TEXT. Controls first and retentions sorted by delta,
 * descending: a reader who has not seen the instrument attested has no reason to
 * believe a byte count.
 *
 * WHAT THIS TABLE IS NOT. Not a ranking, and not a verdict on a decision. A row
 * says what a mechanism holds; whether that is worth what it buys has a second
 * half, and here that half is a TIMING — the write path, for the change tracker.
 * The largest row is not an argument for removing anything.
 *
 * EVERY ROW PRINTS ITS OWN FLOOR, and the marker column is read against it: a
 * delta no larger than the disagreement between two builds of THE SAME arm in
 * that pair is marked rather than silently ranked, whatever the run-wide control
 * says.
 */
export const formatRetainedReport = (records: readonly TRetainedRecord[]): string => {
    const controls = records.filter(record => record.reading.isControl);
    const measured = records
        .filter(record => !record.reading.isControl)
        .slice()
        .sort((a, b) => b.reading.deltaBytes - a.reading.deltaBytes);

    const attestation = attestRetainedRun(records);
    const first = records[0];
    const lines: string[] = [];

    lines.push('OIMDB — WHAT AN OPTION HOLDS, IN BYTES');
    lines.push('');
    lines.push(
        'Each row is one mechanism, measured as the difference between two populations built to ' +
            'differ only in',
    );
    lines.push(
        'it — the same build in three processes, without it, with it, and without it again. THE ' +
            'DELTA IS `on`',
    );
    lines.push(
        'MINUS `off`, so a positive number is what the mechanism COSTS. Nothing here is a timing, ' +
            'and no row',
    );
    lines.push('is a verdict: what a mechanism buys is measured by the other two harnesses.');
    lines.push('');

    if (first !== undefined) {
        lines.push(
            `node ${first.reading.node}   ${first.load.cores} cores   ` +
                `foreign-load gate ${first.load.gate.toFixed(2)}   ` +
                `gc ${first.reading.gcAvailable ? 'exposed' : 'NOT EXPOSED'}   ` +
                'instrument v8.getHeapStatistics().used_heap_size',
        );
        lines.push('');
    }

    /* ── the controls, before anything else ────────────────────────────── */

    lines.push('THE INSTRUMENT, BEFORE ANY BYTE COUNT');
    lines.push('');
    const controlRows: TCells[] = [['delta', 'per row', 'expected', 'rows', 'control']];
    for (const record of controls) {
        const reading = record.reading;
        const expected =
            reading.expectedBytesPerRow === undefined
                ? '0 B'
                : `${reading.expectedBytesPerRow.join(' or ')} B`;
        controlRows.push([
            formatBytes(reading.deltaBytes),
            reading.expectedBytesPerRow === undefined
                ? '—'
                : `${reading.bytesPerRow.toFixed(2)} B`,
            expected,
            reading.rows.toLocaleString('en-US'),
            reading.id,
        ]);
    }
    lines.push(asColumns(controlRows, [true, true, true, true, false]));
    lines.push('');

    if (attestation.pointerBytes !== undefined && attestation.bytesPerReference !== undefined) {
        lines.push(
            `  A reference on this build measures ${attestation.bytesPerReference.toFixed(2)} bytes, ` +
                `which is the ${attestation.pointerBytes === 4 ? 'POINTER-COMPRESSED' : 'UNCOMPRESSED'} ` +
                `answer (${attestation.pointerBytes} bytes).`,
        );
        lines.push(
            '  Every per-row figure below is read against that measurement and not against an ' +
                'assumption.',
        );
    }
    if (attestation.noiseFloorBytes !== undefined) {
        lines.push(
            `  The noise control — the same population built twice, in two processes — came out ` +
                `${formatBytes(attestation.noiseFloorBytes)} apart.`,
        );
        lines.push(
            `  THE RULE FOR THE WHOLE TABLE: no delta smaller than ${formatBytes(attestation.noiseFloorBytes)} ` +
                'is a reading, in either direction.',
        );
    }
    if (!attestation.attested) {
        lines.push('');
        lines.push('  ** VOID — this run may not be believed, and the runner exits non-zero: **');
        for (const reason of attestation.reasons) {
            for (const line of wrap(reason, 88)) lines.push(`     ${line}`);
        }
        lines.push(
            '  Every number below was produced by an instrument that has not been shown to resolve ' +
                'what it claims.',
        );
    }
    lines.push('');

    /* ── the retentions ────────────────────────────────────────────────── */

    lines.push('WHAT IS HELD, largest first');
    lines.push('');
    const measuredRows: TCells[] = [
        ['', 'delta', 'per row', 'refs/row', 'own floor', 'rows', 'path', 'claim'],
    ];
    for (const record of measured) {
        const reading = record.reading;
        const marks: string[] = [];
        // The claim is no larger than the disagreement between two builds of the
        // SAME arm in this very pair. Not a reading.
        if (Math.abs(reading.deltaBytes) <= reading.noiseBytes) marks.push('=');
        if (
            attestation.noiseFloorBytes !== undefined &&
            Math.abs(reading.deltaBytes) <= attestation.noiseFloorBytes
        ) {
            marks.push('=');
        }
        // An arm's two directions disagreed by more than the delta being
        // claimed: something it allocated is still reachable after its root went.
        if (reading.residueBytes > Math.abs(reading.deltaBytes)) marks.push('r');
        if (!reading.settled) marks.push('s');
        if (record.load.over) marks.push('L');
        measuredRows.push([
            marks.length === 0 ? '' : Array.from(new Set(marks)).join(''),
            formatBytes(reading.deltaBytes),
            `${reading.bytesPerRow.toFixed(2)} B`,
            attestation.bytesPerReference === undefined || attestation.bytesPerReference === 0
                ? '—'
                : (reading.bytesPerRow / attestation.bytesPerReference).toFixed(2),
            formatBytes(reading.noiseBytes),
            reading.rows.toLocaleString('en-US'),
            reading.path,
            reading.id,
        ]);
    }
    lines.push(asColumns(measuredRows, [false, true, true, true, true, true, false, false]));
    lines.push('');
    lines.push('  =  the delta is no larger than a floor — this row\'s own, or the run\'s. Not a reading.');
    lines.push('  r  an arm held less on the way down than it gained on the way up by more than the');
    lines.push('     delta itself: something it allocated outlived its root, and the delta is not');
    lines.push('     purely retention.');
    lines.push('  s  a heap stopped moving only when the collection ceiling was reached. Read the');
    lines.push('     settle gaps under the row before believing it.');
    lines.push('  L  foreign load rose above the gate while this pair was measured.');
    lines.push('');
    lines.push(
        '  refs/row is the per-row figure divided by the bytes one reference measured in the ' +
            'control',
    );
    lines.push(
        '  above. On a row that holds references it says how many references\' worth of space each ' +
            'row',
    );
    lines.push(
        '  kept — ABOVE 1.00 IS THE GROWTH OVERSHOOT of the array it was pushed into, which is real ' +
            'and',
    );
    lines.push('  retained. On a row that holds objects it is only a unit of comparison.');
    lines.push('');

    /* ── every row in full ─────────────────────────────────────────────── */

    lines.push('WHAT IS IN EACH NUMBER, AND WHAT IS NOT');
    lines.push('');
    lines.push(
        'A memory delta is a subtraction of two whole-process readings, so everything that differs ' +
            'between',
    );
    lines.push(
        'the two arms is inside it — not only the mechanism but whatever it causes downstream and ' +
            'every',
    );
    lines.push(
        'container it leaves with capacity. Two things are structural and apply to every row. Each ' +
            'arm is',
    );
    lines.push(
        'built ONCE AND DISCARDED before its baseline is read, so compiled code and inline-cache ' +
            'feedback',
    );
    lines.push(
        'are in the baseline rather than in the answer. And each arm measures its own retention ' +
            'TWICE — up',
    );
    lines.push(
        'from the baseline and down from the release — so a row whose two directions disagree is ' +
            'marked',
    );
    lines.push('rather than averaged. Each row states its own.');
    lines.push('');

    for (const record of [...measured, ...controls]) {
        const reading = record.reading;
        lines.push(`${reading.id}   [${reading.path}]   ${formatBytes(reading.deltaBytes)}`);
        lines.push(`  on     ${reading.on}`);
        lines.push(`  off    ${reading.off}`);
        for (const line of wrap(reading.caveat, 92)) lines.push(`  ${line}`);
        lines.push(
            `  measured  on ${reading.onBytes.toLocaleString('en-US')} B, ` +
                `off ${reading.offBytes.toLocaleString('en-US')} B, ` +
                `off again ${reading.offAgainBytes.toLocaleString('en-US')} B; ` +
                `delta ${reading.deltaBytes.toLocaleString('en-US')} B over ` +
                `${reading.rows.toLocaleString('en-US')} rows; ` +
                `own floor ${reading.noiseBytes.toLocaleString('en-US')} B; ` +
                `residue ${reading.residueBytes.toLocaleString('en-US')} B; ` +
                `largest settle gap ${reading.settleGapBytes.toLocaleString('en-US')} B; ` +
                `load ${record.load.start.toFixed(2)} → ${record.load.peak.toFixed(2)} on ` +
                `${record.load.cores} cores, ${ownAllowanceText(record.load)}`,
        );
        for (const arm of reading.arms) lines.push(`  ${armLine(arm)}`);
        lines.push('');
    }

    return lines.join('\n');
};

/**
 * The absolute numbers are printed even though no claim rests on one: a report
 * that printed only the difference would hide a pair whose arms had drifted into
 * being two different benchmarks.
 */
const armLine = (arm: TRetainedArmReading): string =>
    `  ${arm.arm.padEnd(3)}  baseline ${arm.baseline.bytes.toLocaleString('en-US')} B ` +
    `(${arm.baseline.collections} collections, gap ${arm.baseline.gapBytes.toLocaleString('en-US')} B)  ` +
    `held ${arm.held.bytes.toLocaleString('en-US')} B ` +
    `(${arm.held.collections}, ${arm.held.gapBytes.toLocaleString('en-US')} B)  ` +
    `released ${arm.released.bytes.toLocaleString('en-US')} B ` +
    `(${arm.released.collections}, ${arm.released.gapBytes.toLocaleString('en-US')} B)  ` +
    `up ${arm.retainedBytes.toLocaleString('en-US')} B / down ${arm.releasedDeltaBytes.toLocaleString('en-US')} B  ` +
    // No delta is computed from this; it is here so bytes moved OUT of the
    // managed heap cannot pass for bytes saved.
    `external ${arm.externalBytes.toLocaleString('en-US')} B`;
