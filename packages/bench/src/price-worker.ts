// Prose: ./README.md#price-worker
import { planFor, time } from './harness/measure';
import type { TPricePair } from './price/TPricePair';
import type { TPriceReading } from './price/TPriceReading';
import type { TPriceSide } from './price/TPriceSide';
import type { TPriceWanted } from './price/TPriceWanted';

const [catalogueExportName, pairId, wantedArg, sharedPlanArg] = process.argv.slice(2);

const catalogueModule = (await import(`./price/${catalogueExportName}.ts`)) as Record<string, readonly TPricePair[] | undefined>;
const pair = catalogueModule[catalogueExportName]?.find(candidate => candidate.id === pairId);
if (pair === undefined) {
    throw new Error(`price-worker: no pair with id "${pairId}" in ./price/${catalogueExportName}.ts`);
}

const wanted: TPriceWanted =
    wantedArg === 'ours' || wantedArg === 'floor' ? wantedArg : 'both';

if (wanted !== 'both' && pair.isolate !== true && sharedPlanArg === undefined) {
    throw new Error(
        `price-worker: pair "${pairId}" was asked for one side only, with no plan, but it ` +
            'does not declare `isolate`. Splitting a pair across processes costs it the ' +
            'floor-twice drift check and is only correct where the two sides would ' +
            "otherwise pollute each other's inline caches. A re-check of one side under " +
            'a plan already computed for the whole pair passes a plan and does not come ' +
            'through here.',
    );
}

const exposedGc = (globalThis as { gc?: () => void }).gc;
const collect = (): void => {
    if (exposedGc !== undefined) exposedGc();
};

const elapsedMs = (from: bigint): number => Number(process.hrtime.bigint() - from) / 1e6;

/** One untimed warm pass, then the minimum of three, at a given size. */
const passMs = (side: TPriceSide, operations: number): number => {
    side.reset();
    side.run(operations);
    let best = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 3; attempt++) {
        side.reset();
        collect();
        const started = process.hrtime.bigint();
        side.run(operations);
        const took = elapsedMs(started);
        if (took < best) best = took;
    }
    return best;
};

const TARGET_PASS_MS = 25;

/** Beyond this a probe is chasing an operation too cheap to be worth a row. */
const MOST_OPERATIONS = 200_000_000;

const sizeFor = (side: TPriceSide): { operations: number; passMs: number } => {
    const pinned = side.operationsPerPass;
    if (pinned !== undefined) {
        return { operations: pinned, passMs: passMs(side, pinned) };
    }
    let operations = 1024;
    let took = passMs(side, operations);
    // Bounded: a probe that keeps missing its target is a body whose cost is not
    // proportional to its argument, and doubling forever would hang the machine
    // rather than report that.
    for (let attempt = 0; attempt < 12; attempt++) {
        if (took >= TARGET_PASS_MS || operations >= MOST_OPERATIONS) break;
        // At least a doubling, at most 32x in one step: a single wild reading on
        // a busy machine must not be allowed to ask for a billion iterations.
        const wanted = took <= 0.002 ? 32 : TARGET_PASS_MS / took;
        const factor = Math.min(32, Math.max(2, wanted));
        operations = Math.min(MOST_OPERATIONS, Math.ceil(operations * factor));
        took = passMs(side, operations);
    }
    return { operations, passMs: took };
};

// BUILT ONCE, over one dataset, so nothing about the fixture can differ between
// the two sides of the ratio. An isolated pair declines to construct the side it
// was not asked for, because merely FILLING the other design's population would
// teach V8 its shape — the whole thing being kept apart.
//
// AN ORDINARY PAIR IS BUILT WHOLE EVEN WHEN ONLY ONE SIDE WILL BE TIMED: the
// ours re-check asks whether our number reproduces in a second process, so the
// second process has to be the same process — same fixture, same populations,
// same live heap. Only an `isolate` pair may build one side.
const built = pair.build(pair.isolate === true ? wanted : 'both');

if (wanted !== 'both') {
    const side = wanted === 'ours' ? built.ours : built.floor;
    if (sharedPlanArg === undefined) {
        const probe = sizeFor(side);
        process.stdout.write(`${JSON.stringify({ probe: true, ...probe })}\n`);
        process.exit(0);
    }
    const given = JSON.parse(sharedPlanArg) as {
        operations: number;
        warmup: number;
        samples: number;
        repeat: number;
    };
    const timed = time(() => side.run(given.operations), {
        setup: side.reset,
        collect,
        warmup: given.warmup,
        samples: given.samples,
        repeat: given.repeat,
    });
    process.stdout.write(
        `${JSON.stringify({
            side: wanted,
            ns: (timed.min * 1e6) / given.operations,
            operations: given.operations,
            spread: timed.spread,
            warmed: timed.warmed,
            gcAvailable: exposedGc !== undefined,
            node: process.version,
        })}\n`,
    );
    process.exit(0);
}

const oursPlan = sizeFor(built.ours);
const floorPlan = sizeFor(built.floor);

// One plan for BOTH sides; `repeat` pinned to 1 so a GC pause cannot hide inside a sample.
const plan = planFor(
    Math.max(oursPlan.passMs, floorPlan.passMs),
    1,
    (oursPlan.passMs + floorPlan.passMs) / 2,
);

const timeSide = (side: TPriceSide, operations: number) =>
    time(() => side.run(operations), {
        setup: side.reset,
        collect,
        warmup: plan.warmup,
        samples: plan.samples,
        repeat: plan.repeat,
    });

// THE ORDER IS THE MEASUREMENT — floor, ours, floor again, bracketing everything
// our side could have drifted in this process's heap and inline caches.
const floorFirst = timeSide(built.floor, floorPlan.operations);
const ours = timeSide(built.ours, oursPlan.operations);
const floorAgain = timeSide(built.floor, floorPlan.operations);

const nsPerOperation = (sampleMs: number, operations: number): number =>
    (sampleMs * 1e6) / operations;

const oursNs = nsPerOperation(ours.min, oursPlan.operations);
const floorNs = nsPerOperation(floorFirst.min, floorPlan.operations);
const floorAgainNs = nsPerOperation(floorAgain.min, floorPlan.operations);

const isControl = catalogueExportName === 'priceControls';

const reading: Omit<TPriceReading, 'oursAgainNs' | 'oursNoise'> = {
    id: pair.id,
    path: pair.path,
    ours: pair.ours,
    floor: pair.floor,
    caveat: pair.caveat,
    isControl,
    oursNs,
    floorNs,
    floorAgainNs,
    ratio: floorNs === 0 ? Number.POSITIVE_INFINITY : oursNs / floorNs,
    noise:
        Math.min(floorNs, floorAgainNs) === 0
            ? 0
            : Math.abs(floorAgainNs - floorNs) / Math.min(floorNs, floorAgainNs),
    oursOperations: oursPlan.operations,
    floorOperations: floorPlan.operations,
    oursSpread: ours.spread,
    floorSpread: floorFirst.spread,
    samples: plan.samples,
    warmup: plan.warmup,
    repeat: plan.repeat,
    oursWarmed: ours.warmed,
    floorWarmed: Math.min(floorFirst.warmed, floorAgain.warmed),
    gcAvailable: exposedGc !== undefined,
    node: process.version,
};

process.stdout.write(`${JSON.stringify(reading)}\n`);
