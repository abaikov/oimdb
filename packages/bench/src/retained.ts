/**
 * WHAT AN OPTION HOLDS, IN BYTES, FOR THE LIFE OF THE PROCESS.
 *
 * A TIMING RATIO SAYS NOTHING ABOUT WHAT IS LEFT: retention is not slow, it is
 * present, and no stopwatch reports it. This answers claims neither `price.ts` nor
 * `alternatives.ts` can touch. There are two families, on two packages:
 *
 *   `clock.*` — `packages/core`, the SHIPPED engine. What a derivation holds, and
 *   what the per-slot arm of the clock fork would add to it: K×N against 2K, the
 *   quantity that decides the fork and which `src/price/` can only answer in
 *   time. Added
 *   2026-09-01, when this harness stopped weighing the legacy package alone.
 *
 *   `changed-fields.*` — `packages/core-legacy`, whose
 *   `src/modules/wrapper/collection/OIMCollectionChangedFields.ts:72-77` tells a
 *   user that turning a public option off "drops the per-write snapshot clone and
 *   the per-PK snapshot map (~2x entity memory)". The option is legacy, the
 *   sentence is legacy, and the package is still a measured row of the timing
 *   report.
 *
 * How a byte count is made believable — the argument for each part, and for why
 * the instrument is `v8.getHeapStatistics().used_heap_size` rather than
 * `process.memoryUsage()` or a heap snapshot, is in
 * `retained/measureRetainedArm.ts`:
 *
 *   A DELTA, NEVER AN ABSOLUTE — the difference between two populations built to
 *   differ in one mechanism, so their shared history cancels.
 *
 *   A CONTROL WHOSE ANSWER IS KNOWN IN ADVANCE. A pre-sized array of N
 *   references retains N times four bytes on a pointer-compressed V8 and N times
 *   eight without, and there is no third answer. Measured at two sizes, so it
 *   says both whether the instrument resolves a known allocation and what a
 *   reference costs on this build.
 *
 *   A FLOOR, IN BYTES: nothing smaller than the difference between two builds of
 *   the same population is a reading. Measured run-wide by a control and again
 *   per row, by building each pair's `off` arm before and after its `on` arm.
 *
 *   `--expose-gc` AND A SETTLED HEAP, carrying out how many collections it took
 *   and what the last one changed, so a reader can see it settle.
 *
 *     npm run retained                             # everything, controls first
 *     npm run retained -- --only changed-fields    # every pair whose id contains it
 *     npm run retained -- --list                   # the catalogue, without measuring
 *     npm run retained -- --record <dir>           # leave the artifact behind
 *
 * THE CONTROLS ALWAYS RUN, whatever `--only` says, and it matters more here than
 * on a timing table: a reader has no intuition for what a heap reading ought to
 * look like, so nothing catches an unattested one.
 *
 * READ IT BESIDE A TIMING TABLE — what a mechanism HOLDS is here, what it COSTS
 * is the write path, and one without the other is half a decision.
 */
import { formatRetainedReport } from './retained/formatRetainedReport';
import { reportRetainedRun } from './retained/reportRetainedRun';
import { retainedPairs } from './retained/retainedPairs';
import { runRetainedPairs } from './retained/runRetainedPairs';
import type { TRetainedPair } from './retained/TRetainedPair';

const argv = process.argv.slice(2);

const optionValue = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    if (at === -1) return undefined;
    return argv[at + 1];
};

const wantsList = argv.includes('--list');
const only = optionValue('--only');
/** Where this run leaves its artifact — optional, as on the price side. */
const record = optionValue('--record');

const matches = (pair: TRetainedPair): boolean => {
    if (only === undefined) return true;
    return only
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .some(part => pair.id.includes(part));
};

if (wantsList) {
    const rows = [...retainedPairs.controls, ...retainedPairs.measured];
    for (const pair of rows) {
        process.stdout.write(`${pair.path.padEnd(14)}  ${pair.id}\n`);
        process.stdout.write(`${' '.repeat(16)}on   ${pair.on}\n`);
        process.stdout.write(`${' '.repeat(16)}off  ${pair.off}\n`);
    }
    process.exit(0);
}

const selected = retainedPairs.measured.filter(matches);
if (selected.length === 0) {
    process.stderr.write(
        `retained: --only "${only ?? ''}" matched none of the ${retainedPairs.measured.length} ` +
            'pairs. Run with --list to see them.\n',
    );
    process.exit(1);
}

// Controls first and always: they are what say this instrument can reproduce an
// allocation whose size arithmetic already knows.
const run = runRetainedPairs([...retainedPairs.controls, ...selected]);

process.exit(reportRetainedRun(run, formatRetainedReport, record));
