import { asColumns, formatFraction, wrap, type TCells } from '../price/priceReportCells';
import { ARM_DATABASE_ONLY, CONTROL_MINIFIED, CONTROL_TREE_SHAKING } from './bundleControls';
import type { TBundlePiece } from './TBundlePiece';
import type { TBundleReading } from './TBundleReading';
import type { TBundleRetainedModule } from './TBundleRetainedModule';
import type { TBundleRun } from './TBundleRun';

/**
 * THE WHOLE REPORT, AS TEXT — and the copy that outlives the terminal.
 *
 * THE CONTROLS COME FIRST, as they do on every table in this package, and for
 * the same reason: a reader who has not seen the instrument attested has no
 * reason to believe a byte count either.
 *
 * WHAT IS DIFFERENT FROM THE TIMING REPORTS. There is no ranking and no sort.
 * The rows come out in the order the piece declared them, which is the order its
 * argument reads in — sorting them "worst first" would put the biggest number at
 * the top of a table whose rows are measured from DIFFERENT baselines, and a
 * reader would compare two numbers that are not comparable. And there is no
 * noise column, because there is no noise: the same source through the same
 * bundler at the same settings emits the same bytes, and a second run that
 * disagrees means the engine changed, not that the machine was busy.
 *
 * EVERYTHING HERE THAT IS NOT A BYTE COUNT COMES FROM THE PIECE. The title, the
 * opening paragraph, which module the arm table watches, which pairs get
 * decomposed and what a small number would mean are all fields of
 * `TBundlePiece`, so the prose and the numbers are produced by one object in one
 * run and cannot drift into disagreeing about what was measured.
 *
 * EVERY TOTAL IS PRINTED WITH ITS DECOMPOSITION. Two of them: the measured
 * delta, broken into the modules whose contribution moved between the two arms,
 * and each arm's own toll, broken into the modules of `@oimdb/core` it kept and
 * what each cost. A sum has no way to be checked and every way to be quoted; a
 * decomposition beside it names files a reader can open, and turns "a database
 * costs this much" into "and most of it is that module" — which is the form of
 * the answer somebody can act on.
 *
 * THE LAST SECTION IS THE ONE THAT MATTERS MOST IF THE NUMBER IS SMALL. A
 * measurement that refutes the claim it was built for is the measurement most
 * likely to be quietly dropped, so what to conclude from a small number is
 * printed in the artifact rather than left to whoever reads it — including the
 * part that survives a refutation, which is not nothing.
 */
const bytes = (count: number): string => count.toLocaleString('en-US');
const kb = (count: number): string => `${(count / 1024).toFixed(2)} KB`;
const signed = (count: number): string => `${count >= 0 ? '+' : '−'}${bytes(Math.abs(count))}`;
const signedKb = (count: number): string => `${count >= 0 ? '+' : '−'}${kb(Math.abs(count))}`;

/** The module this piece's arm table watches, matched without caring about separators. */
const isSpotlight = (module: string, spotlight: string): boolean =>
    module.replace(/\\/g, '/').endsWith(`/${spotlight}`);

/** What this arm carries of the engine — the sum of the decomposition below it. */
const coreBytesOf = (reading: TBundleReading): number =>
    reading.retained.reduce((total, one) => total + one.bytes, 0);

/**
 * What the spotlit module cost this arm, `undefined` and NOT `0` when the
 * bundler dropped it: a zero would read as "kept, and free".
 */
const spotlightBytesOf = (reading: TBundleReading, spotlight: string): number | undefined =>
    reading.retained.find(one => isSpotlight(one.module, spotlight))?.bytes;

/**
 * HOW MANY MODULES OF AN ARM'S BREAKDOWN THE TERMINAL PRINTS. Nothing is lost:
 * `records.json` holds every module of every arm, and the remainder line prints
 * the COUNT AND THE BYTES of what was cut, so a truncation cannot hide a module
 * large enough to matter.
 *
 * `database-only` is exempt and prints in full. It answers "what does this
 * engine force on a consumer who wants none of it", and an answer to that ending
 * in "and 6 more" is not an answer.
 */
const BREAKDOWN_LINES = 8;

/**
 * WHAT TWO ARMS DIFFER BY, MODULE BY MODULE — the headline number decomposed.
 * A subtraction of two totals is equally consistent with "one module arrived"
 * and with "forty modules each grew a little", and every caveat in this package
 * makes a specific claim about which case it is.
 *
 * A module in BOTH arms with different byte counts belongs here as much as one
 * that arrived: reaching a new export of a shared module grows a bundle and is
 * invisible to a comparison of module NAMES. Sorted by the size of the change
 * and not by sign — a module that SHRANK between two arms meant to differ in one
 * call is the most interesting line the table could have.
 */
const retainedDelta = (
    from: TBundleReading,
    to: TBundleReading,
): readonly TBundleRetainedModule[] => {
    // Explicit type arguments so the tuple inference cannot depend on how the
    // compiler feels about an array literal in a `Map` constructor.
    const before = new Map<string, number>(from.retained.map(one => [one.module, one.bytes]));
    const after = new Map<string, number>(to.retained.map(one => [one.module, one.bytes]));

    const changed: TBundleRetainedModule[] = [];
    for (const module of new Set([...before.keys(), ...after.keys()])) {
        const delta = (after.get(module) ?? 0) - (before.get(module) ?? 0);
        if (delta === 0) continue;
        changed.push({ module, bytes: delta });
    }
    changed.sort(
        (a, b) => Math.abs(b.bytes) - Math.abs(a.bytes) || a.module.localeCompare(b.module),
    );
    return changed;
};

const breakdownOf = (reading: TBundleReading): string[] => {
    if (reading.retained.length === 0) return [];

    const limit =
        reading.id === ARM_DATABASE_ONLY ? reading.retained.length : BREAKDOWN_LINES;
    const shown = reading.retained.slice(0, limit);
    const cut = reading.retained.slice(limit);

    const rows: TCells[] = shown.map(one => [`${bytes(one.bytes)} B`, one.module]);
    if (cut.length > 0) {
        const cutBytes = cut.reduce((total, one) => total + one.bytes, 0);
        rows.push([
            `${bytes(cutBytes)} B`,
            `+ ${cut.length} more modules — every one of them in records.json`,
        ]);
    }

    return asColumns(rows, [true, false])
        .split('\n')
        .map(line => `    ${line}`);
};


export const formatBundleReport = (piece: TBundlePiece, run: TBundleRun): string => {
    const findings = piece.findings(run.readings);
    const controls = findings.filter(finding => finding.isControl);
    const measured = findings.filter(finding => !finding.isControl);
    const spotlight = piece.spotlight;
    const lines: string[] = [];

    lines.push(piece.title);
    lines.push('');
    for (const line of wrap(piece.intro, 96)) lines.push(line);
    lines.push('');

    const chain = run.toolchain;
    lines.push(
        `${chain.bundler} ${chain.bundlerVersion}   ${chain.format} / ${chain.platform} / `
        + `${chain.target}   minify on   gzip -${chain.gzipLevel}   node ${chain.node}`,
    );
    lines.push(
        `engine measured: ${chain.sourceFiles} files, ${bytes(chain.sourceBytes)} B of source `
        + '(comments included — the minifier removes them, the control below says by how much)',
    );
    lines.push('');
    for (const line of wrap(
        'NO LOAD GATE AND NO REFUSAL, unlike every other table under measurements/. A byte count is '
        + 'deterministic: the same source through the same bundler emits the same bytes whatever '
        + 'else the machine is doing. Nothing here was skipped — there was nothing to skip.',
        96,
    )) lines.push(line);
    lines.push('');

    /* ── the controls, before anything else ────────────────────────────── */

    lines.push('THE INSTRUMENT, BEFORE ANY BYTE');
    lines.push('');
    const controlRows: TCells[] = [['', 'from', 'to', 'ratio', 'requirement', 'control']];
    for (const finding of controls) {
        controlRows.push([
            finding.holds ? '' : '!',
            kb(finding.fromBytes),
            kb(finding.toBytes),
            `${(finding.toBytes / finding.fromBytes).toFixed(2)}x`,
            finding.requirement,
            finding.id,
        ]);
    }
    lines.push(asColumns(controlRows, [false, true, true, true, false, false]));
    lines.push('');

    const shaking = controls.find(finding => finding.id === CONTROL_TREE_SHAKING);
    const minifying = controls.find(finding => finding.id === CONTROL_MINIFIED);

    if (shaking === undefined || minifying === undefined) {
        lines.push('  ** A CONTROL DID NOT RUN. Nothing below is attested. **');
    } else if (!shaking.holds || !minifying.holds) {
        lines.push('  ** VOID: a control did not come out. Nothing below is a reading. **');
        for (const finding of controls.filter(control => !control.holds)) {
            for (const line of wrap(`${finding.id}: ${finding.caveat}`, 92)) lines.push(`  ${line}`);
        }
    } else {
        lines.push(
            `  A database alone is ${formatFraction(shaking.toBytes / shaking.fromBytes)} of the `
            + 'published surface, so unreachable code is being dropped.',
        );
        lines.push(
            `  Minifying took the whole surface to ${formatFraction(minifying.toBytes / minifying.fromBytes)} `
            + 'of itself, so the minifier ran and these are shipped bytes.',
        );
    }
    lines.push('');

    /* ── the difference ────────────────────────────────────────────────── */

    lines.push('THE DIFFERENCE');
    lines.push('');
    const rows: TCells[] = [
        ['minified', 'gzipped', 'of package', 'of package (gz)', 'difference'],
    ];
    for (const finding of measured) {
        rows.push([
            signedKb(finding.deltaBytes),
            signedKb(finding.deltaGzipBytes),
            finding.share === undefined ? 'n/a' : formatFraction(finding.share),
            finding.gzipShare === undefined ? 'n/a' : formatFraction(finding.gzipShare),
            finding.id,
        ]);
    }
    lines.push(asColumns(rows, [true, true, true, true, false]));
    lines.push('');
    for (const line of wrap(
        'KB is bytes / 1024. "of package" is the difference over the arm that keeps every export '
        + 'with nothing droppable — the largest denominator available, chosen so the percentage is '
        + 'not flattered.',
        96,
    )) lines.push(line);
    lines.push('');

    for (const finding of measured) {
        lines.push(`${finding.id}`);
        for (const line of wrap(finding.question, 92)) lines.push(`  ${line}`);
        lines.push(
            `  from   ${finding.fromLabel.padEnd(34)} ${bytes(finding.fromBytes)} B  `
            + `${bytes(finding.fromGzipBytes)} B gzipped`,
        );
        lines.push(
            `  to     ${finding.toLabel.padEnd(34)} ${bytes(finding.toBytes)} B  `
            + `${bytes(finding.toGzipBytes)} B gzipped`,
        );
        lines.push('');
    }

    /* ── the measured delta, decomposed into the modules that moved ────── */

    if (piece.decompose.length > 0) {
        lines.push(
            piece.decompose.length === 1
                ? 'WHAT THE DIFFERENCE IS MADE OF'
                : 'WHAT EACH DIFFERENCE IS MADE OF',
        );
        lines.push('');
    }

    for (const pair of piece.decompose) {
        const from = run.readings.find(reading => reading.id === pair.from);
        const to = run.readings.find(reading => reading.id === pair.to);
        if (from === undefined || to === undefined) continue;

        const moved = retainedDelta(from, to);
        const movedBytes = moved.reduce((total, one) => total + one.bytes, 0);
        const bundleDelta = to.minifiedBytes - from.minifiedBytes;

        if (piece.decompose.length > 1) {
            lines.push(`${pair.findingId}   ${pair.from} → ${pair.to}`);
            lines.push('');
        }
        if (moved.length === 0) {
            lines.push('  No module of @oimdb/core changed its contribution between the two arms.');
        } else {
            const movedRows: TCells[] = moved.map(one => [
                `${signed(one.bytes)} B`,
                one.module,
            ]);
            lines.push(
                asColumns(movedRows, [true, false])
                    .split('\n')
                    .map(line => `  ${line}`)
                    .join('\n'),
            );
        }
        lines.push('');
        for (const line of wrap(
            `Every module of @oimdb/core whose contribution differs between the two arms, and by `
            + `how much. They come to ${signed(movedBytes)} B of the ${signed(bundleDelta)} B between `
            + `the two bundles; the remaining ${signed(bundleDelta - movedBytes)} B is the arm's own `
            + 'call site and the bundler\'s glue, which the caveat above deliberately does not '
            + 'subtract. This is the list the caveat\'s claim about WHAT THE DIFFERENCE CONTAINS '
            + 'has to match — if a module nobody mentioned is on it, the claim is stale and this '
            + 'table is the thing that noticed.',
            96,
        )) lines.push(line);
        lines.push('');
    }

    /* ── the arms, so the difference can be checked rather than believed ── */

    lines.push('THE ARMS, IN FULL');
    lines.push('');
    const armRows: TCells[] = [
        ['minified', 'gzipped', 'unminified', 'core kept', 'modules', spotlight.label, 'arm'],
    ];
    for (const reading of run.readings) {
        const diffBytes = spotlightBytesOf(reading, spotlight.module);
        armRows.push([
            kb(reading.minifiedBytes),
            kb(reading.minifiedGzipBytes),
            kb(reading.bundledBytes),
            kb(coreBytesOf(reading)),
            String(reading.retained.length),
            diffBytes === undefined ? 'no' : kb(diffBytes),
            reading.id,
        ]);
    }
    lines.push(asColumns(armRows, [true, true, true, true, true, true, false]));
    lines.push('');
    for (const line of wrap(
        `"core kept", "modules" AND "${spotlight.label}" COUNT WHAT THE BUNDLER KEPT, NOT WHAT IT `
        + 'READ. All three come from '
        + 'esbuild\'s own per-module byte contributions to the minified output: "modules" is how '
        + 'many modules of @oimdb/core contributed more than nothing, "core kept" is what they came '
        + `to together, and "${spotlight.label}" is what ${spotlight.name} contributed on its own — `
        + 'or "no" where the bundler dropped it. A module that was shaken out is absent, not counted '
        + 'at zero.',
        96,
    )) lines.push(line);
    lines.push('');
    for (const line of wrap(
        'AN EARLIER VERSION OF THIS HARNESS READ THE INPUT GRAPH INSTEAD — every file esbuild '
        + 'opened, including the ones it then dropped — and reported the same 61 modules and the '
        + 'same "diff: yes" for all four arms while their bundles differed by a factor of four. A '
        + 'recorded run under measurements/ that still says that predates this fix, and its module '
        + 'column is answering "did the bundler open this file", not "does a consumer ship it".',
        96,
    )) lines.push(line);
    lines.push('');
    for (const line of wrap(
        'AND "core kept" IS A PART OF "minified", NOT A SECOND MEASUREMENT OF IT. What it leaves '
        + 'out is the arm\'s own source and the bundler\'s glue — which is why the ENGINE\'s toll is '
        + 'that column and not the bundle total beside it.',
        96,
    )) lines.push(line);
    lines.push('');
    for (const reading of run.readings) {
        const diffBytes = spotlightBytesOf(reading, spotlight.module);
        lines.push(`${reading.id}   ${reading.file}`);
        lines.push(`  ${reading.what}`);
        /**
         * AN ARM BUILT AGAINST AN ENGINE THAT DOES NOT EXIST SAYS SO ABOVE ITS
         * OWN NUMBERS, and lists what was taken out. A counterfactual arm
         * printed like an ordinary one is a number waiting to be quoted as a
         * reading of the shipped package.
         */
        if (reading.excised !== undefined) {
            lines.push(
                '  COUNTERFACTUAL ARM — built against an engine with the following removed in '
                + 'memory. No published @oimdb/core produces this bundle:',
            );
            for (const one of reading.excised) lines.push(`    - ${one}`);
        }
        lines.push(
            `  kept ${reading.retained.length} modules of @oimdb/core, `
            + `${bytes(coreBytesOf(reading))} B of this arm's ${bytes(reading.minifiedBytes)} B `
            + 'minified bundle:',
        );
        for (const line of breakdownOf(reading)) lines.push(line);
        const verdict = diffBytes === undefined
            ? 'is NOT among them'
            : `IS among them, at ${bytes(diffBytes)} B`;
        lines.push(`  ${spotlight.name} ${verdict}`);
        lines.push('');
    }
    for (const line of wrap(
        `The "${spotlight.label}" column is the bundler's own answer to the question `
        + 'packages/core/tests/what-an-import-retains.test.ts answers by reading import statements '
        + 'with no toolchain at all. Two instruments, one fact. If they ever disagree, one of them '
        + 'is wrong and finding out which is worth more than either number.',
        96,
    )) lines.push(line);
    lines.push('');
    for (const line of wrap(
        'THE BREAKDOWN UNDER EACH ARM IS WHY THE COLUMN CAN BE TRUSTED TO DISAGREE. A count alone '
        + 'has one way to be wrong and no way to show it; a list of modules with the bytes each one '
        + 'contributed can be opened, added up, and checked against the source. database-only is '
        + 'printed in full because it is the toll no consumer can avoid — what this engine charges '
        + 'an application that constructs a database and asks for nothing else, module by module. '
        + 'The longer arms are cut to the largest few, with the count and the bytes of the '
        + 'remainder on the line below; records.json keeps every module of every arm.',
        96,
    )) lines.push(line);
    lines.push('');

    /* ── what a small number would mean ────────────────────────────────── */

    lines.push(piece.closing.heading);
    for (const paragraph of piece.closing.paragraphs) {
        lines.push('');
        for (const line of wrap(paragraph, 96)) lines.push(line);
    }

    return lines.join('\n');
};
