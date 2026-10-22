/**
 * ONE SCENARIO, ONE ADAPTER, AND THE FLOOR — and nothing else measured.
 *
 * For the question asked while changing the engine: DID THIS CHANGE MOVE US, ON
 * THIS TASK, AGAINST THE HAND-WRITTEN BASELINE. `npm run bench` takes an hour of
 * an idle machine, and a check nobody repeats is not a check. So this measures
 * two rows — the arm you name and the floor — plus the resolution control.
 *
 *     npm run duel -- oimdb patchColumn            the arm, the floor, the ratio
 *     npm run duel -- oimdb patchColumn --borrow-plan
 *                                                  ... under a full run's own plan
 *     npm run duel -- oimdb patchColumn --floor oimdb-3.12.1
 *                                                  ... against another engine instead
 *     npm run duel -- oimdb patchColumn --point wide
 *                                                  ... at another of the cell runner's points
 *     npm run duel -- --list                        the arms, the tasks and the points
 *
 * The points are the cell runner's (`cells/points.ts`), and `BENCH_MAX_LOAD`
 * is the same gate, because a second idiom is a second place to look.
 *
 * IT STORES NO PIECE: a two-arm run written into `results/` would either
 * overwrite a full table or sit beside one looking like a measurement of the
 * same thing. So this prints and exits, and `npm run bench` is unaffected.
 *
 * IT DOES NOT RANK. Two rows have no places to hold and no other point to be
 * checked against. The output is a ratio and its error.
 */
import { controlsFor } from './cells/participants';
import { POINTS, pointOf } from './cells/points';
import { formatDuelReport } from './duel/formatDuelReport';
import { runDuel } from './duel/runDuel';
import { ADAPTERS, FLOOR_ADAPTER, adapterByName } from './harness/registry';
import { SCENARIOS, isStoreless, scenarioByKey } from './harness/scenarios';
import { wiringFor, wiringNameOf } from './harness/types';

const argv = process.argv.slice(2);

const optionValue = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    if (at === -1) return undefined;
    return argv[at + 1];
};

const flags = new Set(argv.filter(part => part.startsWith('--')));
const optionNames = new Set(['--floor', '--point']);
const positional = argv.filter((part, at) => {
    if (part.startsWith('--')) return false;
    const before = argv[at - 1];
    return before === undefined || !optionNames.has(before);
});

if (flags.has('--list')) {
    process.stdout.write('ARMS — any of these may be the arm, or the floor with --floor\n');
    for (const adapter of ADAPTERS) {
        process.stdout.write(
            `  ${adapter.name.padEnd(18)} ${adapter.version}` +
                `${adapter.name === FLOOR_ADAPTER.name ? '   ← the default floor, the naive hand-written one' : ''}\n`
        );
    }
    process.stdout.write('\nTASKS\n');
    for (const scenario of SCENARIOS) {
        if (isStoreless(scenario)) continue;
        process.stdout.write(`  ${scenario.key.padEnd(18)} ${scenario.label}\n`);
    }
    process.stdout.write('\nPOINTS — --point, default "default"\n');
    for (const point of POINTS) {
        process.stdout.write(
            `  ${point.key.padEnd(18)} n=${point.n} window=${point.window} processes=${point.processes}\n`
        );
    }
    process.exit(0);
}

const [armName, scenarioKey] = positional;
if (armName === undefined || scenarioKey === undefined) {
    process.stderr.write(
        'duel: takes an adapter and a scenario — `npm run duel -- oimdb patchColumn`. ' +
            'Run with --list to see both.\n'
    );
    process.exit(1);
}

const arm = adapterByName(armName);
const floorName = optionValue('--floor') ?? FLOOR_ADAPTER.name;
const floor = adapterByName(floorName);
const scenario = scenarioByKey(scenarioKey);

if (arm.name === floor.name) {
    // Not a tautology worth measuring: it would print 1.00x and the noise it
    // printed beside it would be the only content.
    process.stderr.write(
        `duel: the arm and the floor are both "${arm.name}". Name a different --floor, or drop it ` +
            `to use the naive floor (${FLOOR_ADAPTER.name}).\n`
    );
    process.exit(1);
}
if (isStoreless(scenario)) {
    // `consumerFloor` runs no store at all — the harness drives the consumer
    // itself in one named adapter's process — so there are no two arms to
    // compare.
    process.stderr.write(
        `duel: "${scenario.key}" is the storeless consumer lower bound — it runs no store, so there ` +
            'is no arm to measure against a floor. Pick a task from --list.\n'
    );
    process.exit(1);
}

for (const chosen of [arm, floor]) {
    const wiring = wiringFor(chosen, scenario);
    if (wiring.build === undefined) {
        process.stderr.write(`duel: ${chosen.name} has no row on "${scenario.key}": ${wiring.absent}\n`);
        process.exit(1);
    }
}

const point = pointOf(optionValue('--point') ?? 'default');

// Kill the whole process group on interrupt: killing the parent alone leaves the
// current worker alive, burning CPU until somebody notices.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(signal, () => {
        try {
            process.kill(-process.pid, 'SIGKILL');
        } catch {
            // Already gone.
        }
        process.exit(1);
    });
}

process.stderr.write(
    `measuring ${arm.name} against ${floor.name} on ${scenario.key} at the ${point.key} point …\n`
);

/**
 * THE FIELD THESE TWO ARMS CAME OUT OF, counted here because this is the entry
 * point that already imports the registry — see {@link TDuelField} for why the
 * report needs it and why the two kinds of absence are kept apart.
 *
 * WHICH DECLARATION A SCRIPT IS ANSWERED FROM is `wiringFor`, the same function
 * `cells/participants.ts` asks in `declineOf` — down to the SHAPE, so a duel on
 * `churnColumn` counts the field of that table and not of the churn family.
 * `participantsOf` itself is not imported because it also resolves the storeless
 * case, which this entry point has already refused, several lines above.
 */
const declaration = wiringNameOf(scenario);
const declining = {
    what: declaration === '' ? '' : `${declaration}.absent`,
    rows: ADAPTERS.filter(
        adapter => wiringFor(adapter, scenario).build === undefined
    ),
};
const wired = ADAPTERS.length - declining.rows.length;
/**
 * How many of the two arms are REGISTRY ROWS. `adapterByName` also resolves the
 * three resolution controls, and a control is not a library — so a duel run
 * against one has measured one row of the field and not two, and saying "two"
 * would understate what the tool left unasked by exactly one.
 */
const armsFromTheField = [arm, floor].filter(chosen =>
    ADAPTERS.some(adapter => adapter.name === chosen.name)
).length;

const run = runDuel({
    armName: arm.name,
    floorName: floor.name,
    floorIsNaive: floor.name === FLOOR_ADAPTER.name,
    field: {
        asked: ADAPTERS.length,
        wired,
        notAsked: wired - armsFromTheField,
        declined: declining.rows.map(adapter => adapter.name),
        what: declining.what,
    },
    scenario,
    point,
    controls: controlsFor(scenario),
    borrowPlan: flags.has('--borrow-plan'),
});

process.stdout.write(`${formatDuelReport(run)}\n`);

/**
 * WHAT MAKES THIS RUN RED, the same list the price entry point uses: a refusal,
 * a void verification, a missing reading, a problem, and — the one that catches
 * people — an UNATTESTED instrument, a control that could not see a difference
 * the harness put there itself. A script the controls decline has no control in
 * the cell runner either, and is not held to one here.
 */
const attested =
    run.control === undefined ? !run.controlsAsked : run.control.gap > run.control.drift;
process.exit(
    run.refusal !== undefined ||
        run.voidReason !== undefined ||
        run.reading === undefined ||
        run.problems.length > 0 ||
        !attested
        ? 1
        : 0
);
