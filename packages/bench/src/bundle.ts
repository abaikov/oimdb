/**
 * WHAT ONE PUBLIC API COSTS AN APPLICATION THAT NEVER CALLS IT.
 *
 * `price.ts` and `alternatives.ts` answer with a stopwatch. This claim cannot be:
 *
 *     "Some 2.7 KB — around 4% of the package"
 *
 * quoted at eight sites as the reason `createOrderedCommands` is a free function
 * rather than a method on `OIMDB`, and never once checked by building a bundle.
 * It is a DIFFERENCE between two applications — one that renders an ordered list
 * and one that does not — and the whole of it is bytes.
 *
 * Four real consumer modules under `bundle/consumers/`, each bundled twice by
 * esbuild — tree-shaken and minified, then unminified as the control — and
 * gzipped in memory. Two are the same application written twice, differing only
 * in that one asks for an ordered list; their difference is the measurement. The
 * other two are the denominator (every export, nothing droppable) and the floor.
 *
 * They are FILES and not source strings in a catalogue, so `npm run type-check`
 * fails the day one stops being a consumer the engine would accept: a bundler
 * does not type-check, and an arm that no longer compiles would go on producing
 * byte counts for an application nobody could write.
 *
 * `OIMDB` is imported by every consumer and a bundler cannot drop a class's
 * methods one at a time, so this difference is exactly what a METHOD would have
 * charged an application that never calls it.
 * `packages/core/tests/what-an-import-retains.test.ts` pins the reachability
 * half; this supplies the size.
 *
 * NO GATE, NO REFUSAL, NO CONTROLS ABOUT THE MACHINE, and that is not an
 * omission: the same source through the same bundler emits the same bytes on a
 * loaded laptop and an idle one. The controls here are about the TOOLCHAIN — that
 * unreachable code is dropped and that the minifier ran — the two ways this can
 * be silently wrong. See `bundle/bundleControls.ts`.
 *
 * THE ONE PAIR WHOSE TWO ARMS ARE TWO ENGINES is `field-machinery`: the
 * per-column subscription apparatus sits in class bodies, which cannot be
 * partially tree-shaken, so no consumer can decline it and two consumer arms
 * would differ by exactly zero. That piece bundles ONE consumer twice, the second
 * time against `packages/core/src` with the apparatus taken out in memory by
 * named rules, each asserted by occurrence count and listed in the report and in
 * `records.json`. Nothing is written to the engine, and an arm built that way is
 * a COUNTERFACTUAL: a bound on what a split would save, not a reading of a
 * package anybody can install. See `bundle/TBundleArm.ts` and
 * `bundle/fieldMachineryExcision.ts`.
 *
 *     npm run bundle                            # the ordered-list table, on a terminal
 *     npm run bundle -- --piece groupings       # a different claim, its own arms
 *     npm run bundle -- --piece field-machinery # the one pair built against two ENGINES
 *     npm run bundle -- --list                  # the pieces and their arms, building nothing
 *     npm run bundle -- --record <dir>          # leave the artifact behind
 *
 * `--piece` AND STILL NO `--only`: two of every table's rows are the controls
 * that make the rest readable, so a run measuring one arm of a difference would
 * measure nothing. A piece is one claim with its own arms, findings, controls
 * and closing argument, recorded into one directory under `measurements/` and
 * cited by one decision. Every piece names both control arms and both sides of
 * every row, and `bundlePieces.ts` refuses a piece whose arm is not catalogued.
 */
import { armsOf, bundleArms } from './bundle/bundleArms';
import { bundlePieces, pieceOf } from './bundle/bundlePieces';
import { EBundlePiece } from './bundle/EBundlePiece';
import { formatBundleReport } from './bundle/formatBundleReport';
import { measureBundleArms } from './bundle/measureBundleArms';
import { writeBundleRun } from './bundle/writeBundleRun';

const argv = process.argv.slice(2);

const optionValue = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    if (at === -1) return undefined;
    return argv[at + 1];
};

if (argv.includes('--list')) {
    for (const one of bundlePieces) {
        process.stdout.write(`${one.id}\n  ${one.what}\n`);
        for (const arm of armsOf(one.armIds)) {
            process.stdout.write(`    ${arm.id.padEnd(28)}${arm.what}\n`);
        }
        process.stdout.write('\n');
    }
    const named = new Set(bundlePieces.flatMap(one => one.armIds));
    const orphans = bundleArms.filter(arm => !named.has(arm.id));
    if (orphans.length > 0) {
        process.stdout.write(
            'arms no piece builds — dead weight, delete them rather than keep them "in case":\n',
        );
        for (const arm of orphans) process.stdout.write(`    ${arm.id}\n`);
    }
    process.exit(0);
}

/**
 * WHICH CLAIM THIS RUN IS ABOUT. The ordered-list piece by default, because it
 * is the one the eight quoted sites are about.
 */
const piece = pieceOf(optionValue('--piece') ?? EBundlePiece.OrderedList);

/** Where this run leaves its artifact — optional, as on the price side. */
const record = optionValue('--record');

const run = await measureBundleArms(armsOf(piece.armIds));

process.stdout.write(`${formatBundleReport(piece, run)}\n`);

if (record !== undefined) {
    writeBundleRun(piece, record, run);
    process.stdout.write(`\nwritten to ${record}\n`);
}

// A VOID REPORT EXITS NON-ZERO EVEN THOUGH IT PRINTED A TABLE — the same rule
// `reportPriceRun.ts` applies to an unattested resolution control.
process.exit(piece.findings(run.readings).every(finding => finding.holds) ? 0 : 1);
