import {
    asColumns,
    formatFraction,
    formatMs,
    formatRatio,
    wrap,
    type TCells,
} from './priceReportCells';
import type { TPriceRecord } from './TPriceRecord';
import {
    CLAIM_MUST_OUTRUN_SCALE_ERROR_BY,
    CONTROL_RESOLUTION,
    CONTROL_SCALE,
    RESOLUTION_AT_LEAST,
    SCALE_ERROR_BANNERS_THE_RUN,
    scaleErrorEatsTheClaim,
} from './priceControls';


/**
 * THE FLOOR'S DISAGREEMENT WITH ITSELF PAST WHICH THE RATIO ON THAT ROW IS NOT A
 * READING — whatever its size, and independently of it.
 *
 * `noise` is `|floorAgain - floor| / min(...)`: the same floor body timed twice,
 * once before our side and once after. The ratio printed on the row divides by
 * the FIRST of the two, and the second was just as entitled to the denominator,
 * so the ratio carries this fraction as a straight multiplicative uncertainty.
 * `flush.empty-vs-noop` in `2026-08-20-price/frame` reports 30.07x against a
 * 1.12 ns floor; against the 5.24 ns the identical floor produced moments later
 * it reports 6.44x. Both divisions are equally entitled and the row was
 * published as a measured 30x.
 *
 * WHY 10%. Every row this repository has recorded was read to place it: 76
 * priced rows over fifteen runs under `measurements/` — 32 printed by this
 * report, 44 by the alternatives table, which is a different argument out of the
 * same `TPriceReading` — median noise 1.6%, 90th percentile 5.4%, 95th 7.7%. The
 * 30 control rows, identical code on both sides by construction, never exceed
 * 4.8%. Past the 95th percentile the recorded values are 11.4%, 11.9%, 366.9%
 * and 47082.5%, with nothing at all between 7.7% and 11.4%. A tenth therefore
 * sits inside an empty band at roughly twice the worst any control produced, and
 * voids four rows out of seventy-six — one of them here, `flush.empty-vs-noop` —
 * rather than a slice of the catalogue.
 *
 * IT IS DELIBERATELY NOT THE 30% THE SPREAD BAR USES, and not because one is
 * stricter for its own sake. Spread is the range within a single timing, where
 * one scheduling hit widens the max while the minimum this harness reports is
 * untouched. Noise is two MINIMA of byte-identical code disagreeing, which a
 * busy machine does not explain away. The graver signal gets the tighter number,
 * and a row can be clean on either bar and hopeless on the other.
 */
export const NOISE_VOIDS_THE_RATIO = 0.1;

/**
 * ONE SIDE OF THIS ROW IS UNCHECKED — a defect of the measurement, written down
 * here because it cannot be repaired here, and an unrepairable defect that is
 * not written down is one nobody will find again.
 *
 * `noise` is `|floorAgainNs - floorFirstNs| / min(...)`. The order is floor,
 * ours, floor (`price-worker.ts`, "THE ORDER IS THE MEASUREMENT"), so the figure
 * every marker above is read against times THE FLOOR AGAINST ITSELF. Our side is
 * timed once. Nothing in the harness ever asks whether it agrees with itself,
 * and the report prints `noise` in a column labelled as if it were the row's
 * error rather than half of it.
 *
 * WHAT THAT HID, MEASURED. `read.members-vs-set-iteration` and
 * `read.members-vs-array-iteration` in `2026-08-20-price/read-2` have a
 * byte-identical `ours` body — written out twice in `pricePairsRead.ts`, the
 * same `for (const slot of db.read(bucket)) slot.entity` walk over the same
 * `groupedFixture()`. Their recorded `oursNs` are 3.2703 and 3.4344, which is
 * 5.02% apart. The set row's whole gap is 25.1 points and 5.0 of them are the
 * harness. Their printed noise: 0.16% and 2.68%. Both rows print bare.
 *
 * SIX MORE GROUPS OF ROWS IN THE RECORDED CORPUS SHARE AN `ours` BODY, and their
 * disagreements are 1.54% (`upsert.insert-vs-map-set` against
 * `upsert.insert-vs-tracked-store`), 2.49% and 7.73% (the two
 * `alt.dirty-flag-vs-*` families), 4.49% (the three
 * `alt.state-on-the-carrier-vs-*` rows), 8.47% (`alt.key-on-the-slot-vs-*`) and
 * 10.01% (`update.column-vs-field-store` against
 * `update.column-vs-tracked-store`, 45.18 against 41.07 ns).
 *
 * WHY THE FORMATTER CANNOT FIX IT — and it is not the reason one would guess.
 * The records do carry a handle: `reading.ours`, the author's one-line
 * description, is identical across every one of those seven groups, and in each
 * one the bodies genuinely are the same — either a shared builder
 * (`keyedFilingSides`) or a copy. So a cross-row check is mechanically possible.
 * It is still the wrong instrument, for two reasons that do not go away. It
 * would key a voided row on PROSE — a label the author writes and can change
 * without touching a body, or forget to change after replacing one. And it can
 * only fire where the catalogue happens to hold two rows with the same `ours`,
 * which is 15 of the 76 recorded rows; a check that covers under a fifth of a
 * table while sitting in the legend of all of it is worse than none.
 *
 * WHAT WOULD ACTUALLY FIX IT, AND WHAT IT COSTS. Not the obvious change. Each
 * pair runs in its own process (`runPricePairs.ts`, one `execFileSync` per
 * pair), so the 5.02% above is a disagreement BETWEEN PROCESSES — two heaps, two
 * JIT histories, two fixtures built from scratch. A pair that declares `isolate`
 * goes further and times each side in a process of its own, which is why those
 * caveats say their `noise` already includes process-to-process variation; our
 * side is timed once there too. Reordering to ours, floor,
 * ours, or adding a fourth timing to make the order floor, ours, floor, ours,
 * would give our side a bracket INSIDE one process and would not have caught it:
 * that check would report a figure of the order the floor's own noise already
 * reports on those rows, 0.16% and 2.68%. It costs one more `timeSide` per pair
 * — the warm-up budget of 1000 ms (`harness/measure.ts`) plus `samples` passes
 * at the 25 ms target (`price-worker.ts`), so about 1.2 s at the recorded plans
 * of 9 samples, a third more per pair and roughly two minutes over the 106 timed
 * pairs of the recorded corpus — and it buys the wrong number.
 *
 * The change that would have caught it is a SECOND PROCESS for our side: after
 * the ordinary worker returns, spawn one more with `['ours', <the same plan>]`
 * — the machinery exists, `measureIsolated` already times one named side under a
 * plan handed in on the command line — and record `oursAgainNs` beside
 * `floorAgainNs`, with the row's error the larger of the two disagreements.
 * `TPriceReading` would have to carry `repeat` for the plan to be reconstructed,
 * or the runner would have to keep the plan the worker computed. Cost: one
 * process spawn and one timing, no probe, so about 1.2 s of clock plus startup
 * per pair — the same order as the fourth timing, for the disagreement that is
 * actually there.
 *
 * THIS IS A CHANGE TO THE ORDER OF MEASUREMENT AND NOT TO A REPORT. It belongs
 * in `price-worker.ts` and `runPricePairs.ts`, and until it is made the `≠`
 * legend says out loud that the noise column is one-sided.
 */

/**
 * The whole report, as text.
 *
 * THE CONTROLS COME FIRST AND THE PRICES ARE SORTED BY RATIO, DESCENDING. Both
 * are deliberate. A reader who has not seen the instrument attested has no
 * reason to believe a price, so the attestation cannot be a footnote; and the
 * expensive abstractions belong at the top where they cannot be missed, because
 * a table that buries its worst rows is an advertisement.
 *
 * EVERY ROW PRINTS ITS OWN NOISE, and the marker column is read against it. A
 * ratio closer to 1.00 than the row's own noise is not a reading — the same code
 * timed twice in that very process disagreed by more than the difference being
 * claimed — and it is marked so rather than silently ranked.
 *
 * THE NOISE IS READ A SECOND TIME, WITHOUT THE RATIO. The rule above compares a
 * claim against the noise and so only ever fires on SMALL claims; a large ratio
 * clears it by being large, which is exactly backwards, because a large ratio is
 * the kind that gets quoted. So noise past `NOISE_VOIDS_THE_RATIO` voids the
 * ratio on its own terms: the denominator was not a settled number, whatever the
 * quotient came out as. The two sides' nanoseconds survive that — they were each
 * measured once and are not divided by anything — which is why the marker says
 * to read them and not the multiple.
 */
export const formatPriceReport = (records: readonly TPriceRecord[]): string => {
    const controls = records.filter(record => record.reading.isControl);
    const priced = records
        .filter(record => !record.reading.isControl)
        .slice()
        .sort((a, b) => b.reading.ratio - a.reading.ratio);

    const first = records[0];
    const lines: string[] = [];

    lines.push('OIMDB — THE PRICE OF EVERY OPERATION AGAINST THE PRIMITIVE IT REPLACES');
    lines.push('');
    lines.push(
        'Each row is one call this library offers, timed against the plain JavaScript a person ' +
            'would have',
    );
    lines.push(
        'written instead of it. Not against another library — against the floor. The ratio is ' +
            'ours over',
    );
    lines.push('the floor, and it is a price tag rather than a ranking.');
    lines.push('');

    if (first !== undefined) {
        lines.push(
            `node ${first.reading.node}   ${first.load.cores} cores   ` +
                `foreign-load gate ${first.load.gate.toFixed(2)}   ` +
                `gc ${first.reading.gcAvailable ? 'exposed' : 'NOT EXPOSED'}`,
        );
        lines.push('');
    }

    /* ── the controls, before anything else ────────────────────────────── */

    lines.push('THE INSTRUMENT, BEFORE ANY PRICE');
    lines.push('');
    const controlRows: TCells[] = [
        ['ratio', 'ours', 'floor', 'noise', 'expected', 'control'],
    ];
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
                `deliberate doubling of work. **`,
        );
        lines.push(
            '  This process could not see a difference it was told was there, so it cannot be ' +
                'trusted to see',
        );
        lines.push(
            '  the ones it was not. Every number below is noise wearing a number\'s clothes. ' +
                'Check what else is',
        );
        lines.push('  running and measure again.');
    } else {
        lines.push(
            `  The resolution control saw ${formatRatio(resolution.reading.ratio)} for a deliberate ` +
                'doubling of work, so this instrument resolves a 2x.',
        );
    }

    const noiseFloor = scale === undefined ? undefined : Math.abs(scale.reading.ratio - 1);
    if (noiseFloor === undefined) {
        lines.push('  ** THE SCALE CONTROL DID NOT RUN. There is no noise floor for this run. **');
    } else {
        lines.push(
            `  The scale control — the same body under two names — came out ${formatFraction(noiseFloor)} ` +
                'from 1.00.',
        );
        lines.push(
            `  THE RULE FOR THE WHOLE TABLE: no ratio within ${formatFraction(noiseFloor)} of 1.00 is a ` +
                'reading, and no',
        );
        lines.push(
            `  claim inside ${formatFraction(CLAIM_MUST_OUTRUN_SCALE_ERROR_BY * noiseFloor)} of it ` +
                `— ${CLAIM_MUST_OUTRUN_SCALE_ERROR_BY}x the error above — is mostly about the code.`,
        );
        if (noiseFloor > SCALE_ERROR_BANNERS_THE_RUN) {
            const eaten = priced.filter(record =>
                scaleErrorEatsTheClaim(Math.abs(record.reading.ratio - 1), noiseFloor),
            );
            lines.push('');
            lines.push(
                `  ** THE INSTRUMENT WAS ${formatFraction(noiseFloor)} OUT ON THIS RUN. The scale ` +
                    'control times the same body under **',
            );
            lines.push(
                `  ** two names, so that ${formatFraction(noiseFloor)} is this machine's own error ` +
                    'and nothing else. **',
            );
            lines.push('');
            lines.push(
                '  It is not a spread and it does not average out: it is one multiplicative factor ' +
                    'sitting under',
            );
            lines.push(
                '  EVERY ratio below, in an unknown direction. The report does not void the table ' +
                    'for it, because a',
            );
            lines.push(
                '  30x claim is not disturbed by a twentieth of itself — but a claim of the same ' +
                    'order as this',
            );
            lines.push(
                '  figure is mostly this figure. A claim that fails to outrun it by ' +
                    `${CLAIM_MUST_OUTRUN_SCALE_ERROR_BY}x carries ± below, and`,
            );
            lines.push(
                eaten.length === 0
                    ? '  it lands on no row here: every ratio below clears it. Read them anyway.'
                    : `  it lands on ${eaten.length} of the ${priced.length} rows below — ` +
                          `${eaten.map(record => record.reading.id).join(', ')}.`,
            );
        }
    }
    lines.push('');

    /* ── the prices ────────────────────────────────────────────────────── */

    lines.push('THE PRICES, worst ratio first');
    lines.push('');
    const priceRows: TCells[] = [
        ['', 'ratio', 'ours', 'floor', 'noise', 'path', 'operation'],
    ];
    for (const record of priced) {
        const reading = record.reading;
        const claim = Math.abs(reading.ratio - 1);
        const marks: string[] = [];
        // The claim is smaller than the disagreement this very process had with
        // itself on identical code. Not a reading.
        if (claim <= reading.noise) marks.push('=');
        if (noiseFloor !== undefined && claim <= noiseFloor) marks.push('=');
        // The claim CLEARS the run's own error and does not clear it by enough.
        // `=` is the point past which a row says nothing; this is the point past
        // which it says something worth quoting, and the band between the two is
        // where a row prints bare while the instrument is the largest single
        // item on it. `find.vs-map-get` at 1.19x on a run whose scale control
        // was 8.2% out is 42% instrument, and printed as a price.
        if (noiseFloor !== undefined && scaleErrorEatsTheClaim(claim, noiseFloor)) marks.push('±');
        // The floor did not equal itself. The rule above cannot catch this on a
        // large ratio — a large claim outruns any noise — so the noise is judged
        // here alone, without the ratio it would otherwise be compared against.
        if (reading.noise > NOISE_VOIDS_THE_RATIO) marks.push('≠');
        if (reading.oursSpread > 0.3 || reading.floorSpread > 0.3) marks.push('~');
        if (record.load.over) marks.push('L');
        if (reading.oursWarmed < reading.warmup || reading.floorWarmed < reading.warmup) {
            marks.push('w');
        }
        priceRows.push([
            marks.length === 0 ? '' : Array.from(new Set(marks)).join(''),
            formatRatio(reading.ratio),
            formatMs(reading.oursNs / 1e6),
            formatMs(reading.floorNs / 1e6),
            formatFraction(reading.noise),
            reading.path,
            reading.id,
        ]);
    }
    lines.push(asColumns(priceRows, [false, true, true, true, true, false, false]));
    lines.push('');
    lines.push('  =  the claim is no larger than the instrument\'s own disagreement. Not a reading.');
    lines.push(
        `  ±  the claim clears this run's own error but not by ${CLAIM_MUST_OUTRUN_SCALE_ERROR_BY}x. ` +
            'The scale control above is the',
    );
    lines.push('     largest single item on this row — more of what it reports is the machine than is');
    lines.push('     any one thing the two designs do differently. Read it as a direction, not a size.');
    lines.push(
        `  ≠  the floor disagreed with itself by more than ${NOISE_VOIDS_THE_RATIO * 100}% between ` +
            'the timing before our',
    );
    lines.push('     side and the timing after — the noise column says by how much. Each side\'s');
    lines.push('     nanoseconds are still readings; the ratio between them divides by a denominator');
    lines.push('     this process never settled on, and is not.');
    lines.push('     THE NOISE COLUMN IS ONE-SIDED. It is the FLOOR timed twice; our side is timed');
    lines.push('     once and never checked against itself. See `ONE SIDE OF THIS ROW IS UNCHECKED`');
    lines.push('     in `formatPriceReport.ts` for what that hides and what it would take to see it.');
    lines.push('  ~  the spread inside the process exceeded 30%: the machine was busy, not the code.');
    lines.push('  L  foreign load rose above the gate while this pair was measured.');
    lines.push('  w  a side reached the warm-up ceiling before the planned count. It entered the');
    lines.push('     clock at a lower V8 tier than its partner; the counts are under each row.');
    lines.push('');

    /* ── where the floor and the call are not doing the same work ───────── */

    lines.push('WHERE THE FLOOR AND OUR CALL ARE NOT DOING THE SAME WORK');
    lines.push('');
    lines.push(
        'There is no pair in this suite whose two sides do identical work, and a floor that does ' +
            'less is a',
    );
    lines.push(
        'lie in our favour. Two of these are structural and apply to most rows: a Map-keyed floor ' +
            'pays a',
    );
    lines.push(
        'hash where our identity path does not, which flatters us; and our write additionally ' +
            'marks a channel',
    );
    lines.push(
        'and may route to indexes the floor knows nothing about, which does not. Each row says ' +
            'its own.',
    );
    lines.push('');
    lines.push(
        'A THIRD ONE BELONGS TO THE INSTRUMENT AND APPLIES TO EVERY ROW. Both sides are driven by ' +
            'a loop —',
    );
    lines.push(
        'an increment, a bounds check, an index wrap and one store into a sink — and that loop is ' +
            'charged',
    );
    lines.push(
        'to the numerator and the denominator alike. Adding the same constant to both pulls a ' +
            'ratio toward',
    );
    lines.push(
        '1.00, and it pulls hardest where the operation is cheapest, so the sub-nanosecond rows ' +
            'are the ones',
    );
    lines.push(
        'this understates most. The wrap is a mask rather than a division for exactly that ' +
            'reason. Read',
    );
    lines.push(
        '`find.vs-map-get` as the calibration: it is one call and one Map.get on our side against ' +
            'one Map.get',
    );
    lines.push('on the floor, so whatever it reports above 1.00 is mostly this.');
    lines.push('');

    for (const record of priced) {
        const reading = record.reading;
        lines.push(`${reading.id}   [${reading.path}]   ${formatRatio(reading.ratio)}`);
        lines.push(`  ours   ${reading.ours}`);
        lines.push(`  floor  ${reading.floor}`);
        for (const line of wrap(reading.caveat, 92)) lines.push(`  ${line}`);
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

    /* ── the controls' own caveats, last, because they are not prices ──── */

    lines.push('THE CONTROLS, IN FULL');
    lines.push('');
    for (const record of controls) {
        lines.push(`${record.reading.id}   ${formatRatio(record.reading.ratio)}`);
        lines.push(`  ours   ${record.reading.ours}`);
        lines.push(`  floor  ${record.reading.floor}`);
        for (const line of wrap(record.reading.caveat, 92)) lines.push(`  ${line}`);
        lines.push('');
    }

    return lines.join('\n');
};
