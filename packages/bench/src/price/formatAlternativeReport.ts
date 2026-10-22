import {
    asColumns,
    formatFraction,
    formatMs,
    formatRatio,
    wrap,
    type TCells,
} from './priceReportCells';
import type { TPriceRecord } from './TPriceRecord';
import { CONTROL_RESOLUTION, CONTROL_SCALE, RESOLUTION_AT_LEAST } from './priceControls';

/**
 * The two control ids and the threshold the resolution control has to clear.
 *
 * Repeated from `formatPriceReport.ts` rather than shared, because the two
 * reports are two readers of the same control and neither owns it — the argument
 * for the 1.5 is written once, on `priceControls.ts`, and both reports quote it.
 * If a third consumer appears, the constant belongs on the controls module and
 * this comment is the reason to move it rather than copy it a third time.
 */

/** How wide a caveat is wrapped. The price report's width, so the two align. */
const PROSE_WIDTH = 92;

/**
 * WHAT ONE ROW SAYS ONCE THE NOISE FLOOR HAS BEEN APPLIED TO IT.
 *
 * Three outcomes and not two. A decision does not merely win or lose: it can
 * also fail to be decided, and on this table that is the outcome most likely to
 * be misread as "the two are equal". They are not the same sentence. "Equal"
 * is a claim about the designs; "unsettled" is a statement that this machine, at
 * this moment, could not tell them apart — a different run on a quieter machine
 * may well separate them.
 */
type TVerdict = 'shipped' | 'rejected' | 'unsettled';

const verdictOf = (ratio: number, noise: number, noiseFloor: number | undefined): TVerdict => {
    if (!Number.isFinite(ratio)) return 'unsettled';
    const claim = Math.abs(ratio - 1);
    // Both bars, because they measure different things: `noise` is what THIS
    // process disagreed with itself by on identical code, and the floor is what
    // the scale control found on the machine as a whole. A claim smaller than
    // either of them is a claim this run cannot make.
    if (claim <= noise) return 'unsettled';
    if (noiseFloor !== undefined && claim <= noiseFloor) return 'unsettled';
    return ratio < 1 ? 'shipped' : 'rejected';
};

/**
 * The number a reader actually wants out of a winning row.
 *
 * `0.40x` is the ratio and it is the wrong way round for a human: nobody says a
 * design is "0.40 times as expensive", they say it is 2.5x cheaper. So the
 * reciprocal is printed beside the ratio rather than left for the reader to
 * compute, and an unsettled row prints no margin at all — a margin on a
 * difference the instrument could not resolve is precisely the figure that would
 * get quoted onward.
 */
const marginOf = (ratio: number, verdict: TVerdict): string => {
    if (verdict === 'unsettled') return 'unsettled';
    if (!Number.isFinite(ratio) || ratio === 0) return 'n/a';
    if (ratio < 1) return `${formatRatio(1 / ratio)} cheaper`;
    return `${formatRatio(ratio)} DEARER`;
};

/**
 * THE ALTERNATIVES REPORT — every design this engine turned down, timed beside
 * the one it shipped.
 *
 * IT IS NOT THE PRICE REPORT WITH A DIFFERENT HEADING, and the difference is the
 * only reason this function exists. `price-worker.ts` computes one ratio, ours
 * over the floor, and here the floor is not a primitive a person would have
 * written — it is the design that was proposed and refused. So the direction
 * inverts: BELOW 1.00 the shipped design wins, ABOVE 1.00 the decision was
 * wrong. Run these records through `formatPriceReport` and the rows we did best
 * on are sorted to the top under the word "worst", which is the table read
 * exactly backwards.
 *
 * Hence: ascending sort, a legend before the table rather than after it, a
 * margin column that reads the way a person speaks, and a `!` on every row where
 * the rejected design won — because those rows are the point of the catalogue
 * and a report that let them scroll past would be the advertisement this suite
 * was built to not be.
 */
export const formatAlternativeReport = (records: readonly TPriceRecord[]): string => {
    const controls = records.filter(record => record.reading.isControl);
    // ASCENDING. The decisions this engine got most right come first; the ones
    // where the design we refused turned out to be faster come last, where the
    // `!` markers and the verdict sentences under them are what a reader leaves
    // with.
    const decisions = records
        .filter(record => !record.reading.isControl)
        .slice()
        .sort((a, b) => a.reading.ratio - b.reading.ratio);

    const first = records[0];
    const lines: string[] = [];

    lines.push('OIMDB — THE DESIGNS WE REJECTED, MEASURED BESIDE THE ONE WE SHIPPED');
    lines.push('');
    lines.push(
        'Each row is one architectural decision. `ours` is the design that shipped; `floor` is ' +
            'the design',
    );
    lines.push(
        'that was proposed and refused. Not a primitive — a candidate. The ratio is still ours ' +
            'over the',
    );
    lines.push('floor, and it is a verdict on a decision rather than a price tag.');
    lines.push('');

    if (first !== undefined) {
        lines.push(
            `node ${first.reading.node}   ${first.load.cores} cores   ` +
                `foreign-load gate ${first.load.gate.toFixed(2)}   ` +
                `gc ${first.reading.gcAvailable ? 'exposed' : 'NOT EXPOSED'}`,
        );
        lines.push('');
    }

    /* ── the controls, before any verdict ──────────────────────────────── */

    lines.push('THE INSTRUMENT, BEFORE ANY VERDICT');
    lines.push('');
    const controlRows: TCells[] = [['ratio', 'ours', 'floor', 'noise', 'expected', 'control']];
    for (const record of controls) {
        const expected = record.reading.id === CONTROL_RESOLUTION ? '~1.9x' : '1.00x';
        controlRows.push([
            formatRatio(record.reading.ratio),
            formatMs(record.reading.oursNs / 1e6),
            formatMs(record.reading.floorNs / 1e6),
            formatFraction(record.reading.noise),
            expected,
            record.reading.id,
        ]);
    }
    lines.push(asColumns(controlRows, [true, true, true, true, true, false]));
    lines.push('');

    const resolution = controls.find(record => record.reading.id === CONTROL_RESOLUTION);
    const scale = controls.find(record => record.reading.id === CONTROL_SCALE);

    if (resolution === undefined) {
        lines.push('  ** THE RESOLUTION CONTROL DID NOT RUN. Nothing below is attested. **');
    } else if (resolution.reading.ratio < RESOLUTION_AT_LEAST) {
        lines.push(
            `  ** VOID: the resolution control reports ${formatRatio(resolution.reading.ratio)} for a ` +
                'deliberate doubling of work. **',
        );
        lines.push(
            '  This process could not see a difference it was told was there, so it cannot be ' +
                'trusted to see',
        );
        lines.push(
            '  the ones it was not. No decision below is settled by this run in either ' +
                'direction. Check what',
        );
        lines.push('  else is running and measure again.');
    } else {
        lines.push(
            `  The resolution control saw ${formatRatio(resolution.reading.ratio)} for a deliberate ` +
                'doubling of work, so this instrument resolves a 2x.',
        );
    }

    const noiseFloor = scale === undefined ? undefined : Math.abs(scale.reading.ratio - 1);
    if (noiseFloor === undefined) {
        lines.push('  ** THE SCALE CONTROL DID NOT RUN. There is no noise floor for this run. **');
        lines.push(
            '  Without it no row below can be told from the instrument, and a design comparison ' +
                'that cannot be',
        );
        lines.push('  told from the instrument settles nothing.');
    } else {
        lines.push(
            `  The scale control — the same body under two names — came out ${formatFraction(noiseFloor)} ` +
                'from 1.00.',
        );
        lines.push(
            `  THE RULE FOR THE WHOLE TABLE: no ratio within ${formatFraction(noiseFloor)} of 1.00 is a ` +
                'reading.',
        );
        lines.push('');
        lines.push(
            '  AND IT BITES HARDER HERE THAN ON A PRICE TABLE. A price of 34x survives a 6% noise ' +
                'floor without',
        );
        lines.push(
            '  a scratch — nobody rereads a 34x because the instrument wobbles by a twentieth of ' +
                'it. A decision',
        );
        lines.push(
            '  that wins by 4% does not survive it at all: the margin IS the instrument. Such a ' +
                'row is not a',
        );
        lines.push(
            '  narrow win and it is not a tie either — the decision is UNSETTLED, which is a ' +
                'different sentence',
        );
        lines.push(
            '  from "the two designs are equal". Equal is a claim about the designs; unsettled is ' +
                'a statement',
        );
        lines.push(
            '  about this machine at this moment, and a quieter one may separate them. Those ' +
                'rows print no',
        );
        lines.push('  margin, because a margin the instrument could not resolve is what gets quoted on.');
    }
    lines.push('');

    /* ── how to read a row, BEFORE the rows ────────────────────────────── */

    lines.push('HOW TO READ A ROW HERE — THE OPPOSITE OF THE PRICE TABLE');
    lines.push('');
    lines.push(
        '  ratio = ours / floor, where the floor is THE DESIGN WE REJECTED. So the direction is ' +
            'inverted',
    );
    lines.push('  against every other table in this suite:');
    lines.push('');
    lines.push(
        '    below 1.00   the shipped design wins. The margin column says by how much: it is ' +
            '1 / ratio,',
    );
    lines.push(
        '                 because 0.40x is the ratio and "2.5x cheaper" is what a person means ' +
            'by it.',
    );
    lines.push(
        '    above 1.00   THE REJECTED DESIGN WON AND THE DECISION WAS WRONG. Marked `!`, and ' +
            'it is a',
    );
    lines.push(
        '                 finding rather than an error in the harness. Several pairs in this ' +
            'catalogue were',
    );
    lines.push(
        '                 written by their authors EXPECTING to lose — a delivery list against ' +
            'a scan at',
    );
    lines.push(
        '                 50% dirty, coalescing at one write per node per frame, a field filter ' +
            'at one in',
    );
    lines.push(
        '                 four skipped — because a comparison that only ever vindicates its ' +
            'author is a',
    );
    lines.push(
        '                 comparison nobody should believe. Those rows are the most valuable in ' +
            'the suite.',
    );
    lines.push('');

    /* ── the decisions ─────────────────────────────────────────────────── */

    lines.push('THE DECISIONS, the ones we got most right first');
    lines.push('');
    const decisionRows: TCells[] = [
        ['', 'ratio', 'margin', 'ours', 'floor', 'noise', 'path', 'decision'],
    ];
    const tally: Record<TVerdict, number> = { shipped: 0, rejected: 0, unsettled: 0 };
    for (const record of decisions) {
        const reading = record.reading;
        const verdict = verdictOf(reading.ratio, reading.noise, noiseFloor);
        tally[verdict]++;

        const marks: string[] = [];
        // First in the string, so it is the leftmost thing on the row: a
        // decision that came out wrong may not be something a reader scrolls
        // past on their way to the wins.
        if (reading.ratio > 1) marks.push('!');
        // The claim is smaller than the disagreement this very process had with
        // itself on identical code. Not a reading.
        if (Math.abs(reading.ratio - 1) <= reading.noise) marks.push('=');
        if (noiseFloor !== undefined && Math.abs(reading.ratio - 1) <= noiseFloor) marks.push('=');
        if (reading.oursSpread > 0.3 || reading.floorSpread > 0.3) marks.push('~');
        if (record.load.over) marks.push('L');
        if (reading.oursWarmed < reading.warmup || reading.floorWarmed < reading.warmup) {
            marks.push('w');
        }
        decisionRows.push([
            marks.length === 0 ? '' : Array.from(new Set(marks)).join(''),
            formatRatio(reading.ratio),
            marginOf(reading.ratio, verdict),
            formatMs(reading.oursNs / 1e6),
            formatMs(reading.floorNs / 1e6),
            formatFraction(reading.noise),
            reading.path,
            reading.id,
        ]);
    }
    lines.push(asColumns(decisionRows, [false, true, true, true, true, true, false, false]));
    lines.push('');
    lines.push('  !  THE REJECTED DESIGN WON THIS ROW. A finding, not a failure of the harness —');
    lines.push('     read the caveat under it before deciding what it settles. A row carrying both');
    lines.push('     `!` and `=` lost by less than the instrument can resolve: unsettled, not lost.');
    lines.push('  =  the claim is no larger than the instrument\'s own disagreement. Not a reading,');
    lines.push('     and on this table that means the decision is unsettled rather than the two');
    lines.push('     designs being equal.');
    lines.push('  ~  the spread inside the process exceeded 30%: the machine was busy, not the code.');
    lines.push('  L  foreign load rose above the gate while this pair was measured.');
    lines.push('  w  a side reached the warm-up ceiling before the planned count. It entered the');
    lines.push('     clock at a lower V8 tier than its partner; the counts are under each row.');
    lines.push('');
    lines.push(
        `  ${tally.shipped} of ${decisions.length} decisions stand on this run, ` +
            `${tally.rejected} came out wrong, ${tally.unsettled} are unsettled.`,
    );
    lines.push('');

    /* ── where the two sides are not doing the same work ───────────────── */

    lines.push('WHERE THE TWO SIDES ARE NOT DOING THE SAME WORK');
    lines.push('');
    lines.push(
        'On a price table an unequal floor flatters us and that is the whole risk: a primitive ' +
            'doing less',
    );
    lines.push(
        'than our call makes the abstraction look cheaper than it is. HERE THE RISK IS A ' +
            'DIFFERENT AND WORSE',
    );
    lines.push(
        'ONE. A floor that is not the rejected design faithfully built means we may have refused ' +
            'a design we',
    );
    lines.push(
        'never actually measured — and then printed a number saying we were right to. That is ' +
            'the failure this',
    );
    lines.push('catalogue exists to prevent, and it cannot be checked from a ratio.');
    lines.push('');
    lines.push(
        'So it is checked from the caveats, which are printed in full under every row below. ' +
            'Each one names',
    );
    lines.push(
        'what the rejected design would have BOUGHT — the reason somebody proposed it — before ' +
            'it names',
    );
    lines.push(
        'anything else, and states which way each inequality pushes that row\'s ratio. No claim ' +
            'is summarised',
    );
    lines.push('here that a row does not make for itself.');
    lines.push('');
    lines.push(
        'ONE THING IS STRUCTURAL AND APPLIES WHEREVER BOTH ARMS RUN THE ENGINE: the price tables ' +
            'put our code',
    );
    lines.push(
        'against a `Map` that nothing of ours can spoil, and that is no longer true when both ' +
            'sides call the',
    );
    lines.push(
        'same compiled function through the same inline caches. One side\'s shapes then reach ' +
            'the other\'s',
    );
    lines.push(
        'measurement inside one process. The rows where that applies say so, and say which way ' +
            'it leans.',
    );
    lines.push('');

    for (const record of decisions) {
        const reading = record.reading;
        const verdict = verdictOf(reading.ratio, reading.noise, noiseFloor);
        const sentence =
            verdict === 'shipped'
                ? `the shipped design wins — ${marginOf(reading.ratio, verdict)}`
                : verdict === 'rejected'
                  ? `!  THE REJECTED DESIGN WINS — ${marginOf(reading.ratio, verdict)}. This decision came out wrong.`
                  : 'UNSETTLED — the difference is inside this run\'s own error. Neither design is shown to win.';
        lines.push(`${reading.id}   [${reading.path}]   ${formatRatio(reading.ratio)}`);
        lines.push(`  verdict  ${sentence}`);
        lines.push(`  ours     ${reading.ours}`);
        lines.push(`  floor    ${reading.floor}`);
        for (const line of wrap(reading.caveat, PROSE_WIDTH)) lines.push(`  ${line}`);
        lines.push(
            `  measured  ${reading.oursOperations.toLocaleString('en-US')} ops/pass ours, ` +
                `${reading.floorOperations.toLocaleString('en-US')} floor; ` +
                `${reading.samples} samples; warm-up ${reading.warmup} planned, ` +
                `${reading.oursWarmed}/${reading.floorWarmed} reached; ` +
                `spread ${formatFraction(reading.oursSpread)}/${formatFraction(reading.floorSpread)}; ` +
                `load ${record.load.start.toFixed(2)} → ${record.load.peak.toFixed(2)} on ` +
                `${record.load.cores} cores`,
        );
        lines.push('');
    }

    /* ── the controls' own caveats, last, because they decide nothing ──── */

    lines.push('THE CONTROLS, IN FULL');
    lines.push('');
    for (const record of controls) {
        lines.push(`${record.reading.id}   ${formatRatio(record.reading.ratio)}`);
        lines.push(`  ours   ${record.reading.ours}`);
        lines.push(`  floor  ${record.reading.floor}`);
        for (const line of wrap(record.reading.caveat, PROSE_WIDTH)) lines.push(`  ${line}`);
        lines.push('');
    }

    return lines.join('\n');
};
