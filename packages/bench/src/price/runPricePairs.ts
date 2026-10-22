// Prose: ./README.md#runpricepairs
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BenchLoad } from '../harness/load';
import { planFor } from '../harness/measure';
import { bundledWorkerPath } from '../harness/workerBundle';
import type { TPricePair } from './TPricePair';
import type { TPriceReading } from './TPriceReading';
import type { TPriceRecord } from './TPriceRecord';
import type { TPriceRun } from './TPriceRun';

/**
 * THE MEASURING HALF OF EVERY ENTRY POINT THAT PRICES SOMETHING.
 *
 * `price.ts` and `alternatives.ts` differ ONLY in which catalogue they select
 * and which report they print. The spawning, the six-process isolation, the ours
 * re-check, the load gate and the order of the timings live here, because a fix
 * to how a pair is timed that reached one table and not the other would make the
 * two artifacts silently incomparable.
 */

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, '..', 'price-worker.ts');

let catalogueOfPair: (id: string) => string | undefined = () => undefined;

const runWorker = (pairId: string, args: readonly string[] = []): string => {
    const catalogueExportName = catalogueOfPair(pairId);
    if (catalogueExportName === undefined) throw new Error(`price: no catalogue file holds the pair "${pairId}"`);
    const out = execFileSync(
        process.execPath,
        ['--expose-gc', bundledWorkerPath(workerPath), catalogueExportName, pairId, ...args],
        {
            encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
            timeout: 5 * 60 * 1000,
            killSignal: 'SIGKILL',
        },
    );
    const line = out.trim().split('\n').filter(Boolean).pop();
    if (line === undefined) throw new Error('the worker produced no output');
    return line;
};

type TSideReading = {
    readonly ns: number;
    readonly operations: number;
    readonly spread: number;
    readonly warmed: number;
    readonly gcAvailable: boolean;
    readonly node: string;
};

/**
 * What one process can say about a pair: the whole reading except the half of it
 * that is a disagreement BETWEEN processes. See the head of `price-worker.ts`.
 */
type TPairReading = Omit<TPriceReading, 'oursAgainNs' | 'oursNoise'>;

/**
 * TWO TIMINGS OF ONE BODY, AS A FRACTION OF THE SMALLER. One definition for both
 * halves of a row's error. The smaller is the denominator so the figure does not
 * depend on which reading was taken first — either was equally entitled to it.
 */
const disagreement = (first: number, second: number): number => {
    const smaller = Math.min(first, second);
    return smaller === 0 ? 0 : Math.abs(second - first) / smaller;
};

const timeOursAgain = (pairId: string, from: TPairReading): TSideReading =>
    JSON.parse(
        runWorker(pairId, [
            'ours',
            JSON.stringify({
                operations: from.oursOperations,
                warmup: from.warmup,
                samples: from.samples,
                repeat: from.repeat,
            }),
        ]),
    ) as TSideReading;

const measureIsolated = (pair: TPricePair, load: BenchLoad): TPriceReading => {
    const probe = (side: 'ours' | 'floor'): { operations: number; passMs: number } =>
        JSON.parse(runWorker(pair.id, [side])) as { operations: number; passMs: number };

    load.sample();
    const floorProbe = probe('floor');
    const oursProbe = probe('ours');
    load.sample();

    const plan = planFor(
        Math.max(oursProbe.passMs, floorProbe.passMs),
        1,
        (oursProbe.passMs + floorProbe.passMs) / 2,
    );

    const timeOne = (side: 'ours' | 'floor', operations: number): TSideReading => {
        const reading = JSON.parse(
            runWorker(pair.id, [
                side,
                JSON.stringify({
                    operations,
                    warmup: plan.warmup,
                    samples: plan.samples,
                    repeat: plan.repeat,
                }),
            ]),
        ) as TSideReading;
        load.sample();
        return reading;
    };

    const floorFirst = timeOne('floor', floorProbe.operations);
    const ours = timeOne('ours', oursProbe.operations);
    const floorAgain = timeOne('floor', floorProbe.operations);
    const oursAgain = timeOne('ours', oursProbe.operations);

    return {
        id: pair.id,
        path: pair.path,
        ours: pair.ours,
        floor: pair.floor,
        caveat: pair.caveat,
        isControl: false,
        oursNs: ours.ns,
        floorNs: floorFirst.ns,
        floorAgainNs: floorAgain.ns,
        oursAgainNs: oursAgain.ns,
        ratio: floorFirst.ns === 0 ? Number.POSITIVE_INFINITY : ours.ns / floorFirst.ns,
        noise: disagreement(floorFirst.ns, floorAgain.ns),
        oursNoise: disagreement(ours.ns, oursAgain.ns),
        oursOperations: ours.operations,
        floorOperations: floorFirst.operations,
        oursSpread: ours.spread,
        floorSpread: floorFirst.spread,
        samples: plan.samples,
        warmup: plan.warmup,
        repeat: plan.repeat,
        // THE LEAST EITHER TIMING OF THAT SIDE REACHED. A row is as warm as its
        // coldest reading, and both readings of a side now go into the row.
        oursWarmed: Math.min(ours.warmed, oursAgain.warmed),
        floorWarmed: Math.min(floorFirst.warmed, floorAgain.warmed),
        gcAvailable: ours.gcAvailable,
        node: ours.node,
    };
};

const measure = (pair: TPricePair, load: BenchLoad): TPriceReading | string => {
    if (pair.isolate === true) {
        try {
            return measureIsolated(pair, load);
        } catch (error) {
            const message = (error as Error).message ?? String(error);
            return message.split('\n').slice(0, 4).join(' / ');
        }
    }
    load.sample();
    try {
        const pairReading = JSON.parse(runWorker(pair.id)) as TPairReading;
        load.sample();
        // The second process goes through `runWorker` like every other — see the
        // rule on it.
        const oursAgain = timeOursAgain(pair.id, pairReading);
        return {
            ...pairReading,
            oursAgainNs: oursAgain.ns,
            oursNoise: disagreement(pairReading.oursNs, oursAgain.ns),
            oursWarmed: Math.min(pairReading.oursWarmed, oursAgain.warmed),
        };
    } catch (error) {
        const message = (error as Error).message ?? String(error);
        return message.split('\n').slice(0, 4).join(' / ');
    } finally {
        load.sample();
    }
};

/**
 * WHAT ONE PAIR COSTS IN PROCESSES — the two spawn counts of the functions above,
 * which is what the load gate has to allow for. A spawn added to either of them is
 * a number to change here; each function's heading states its own count, and the
 * three sentences have to agree.
 *
 * IT IS NOT `PROCESSES_PER_VARIANT`. That is the timing runner's replicate count,
 * and `BENCH_PROCESSES` does not change a single spawn on this path.
 */
const processesFor = (pair: TPricePair): number => (pair.isolate === true ? 6 : 2);

export const runPricePairs = (pairs: readonly TPricePair[], catalogueOf: (id: string) => string | undefined): TPriceRun => {
    catalogueOfPair = catalogueOf;
    const records: TPriceRecord[] = [];
    const refused: string[] = [];
    const failed: string[] = [];

    for (const pair of pairs) {
        const load = new BenchLoad(processesFor(pair));
        const refusal = load.refusal();
        if (refusal !== undefined) {
            refused.push(`${pair.id}: ${refusal}`);
            continue;
        }
        // stderr, so that a report piped to a file is the report and the
        // progress is still on the terminal of the person waiting for it.
        process.stderr.write(`measuring ${pair.id} ...\n`);
        const result = measure(pair, load);
        if (typeof result === 'string') {
            failed.push(`${pair.id}: ${result}`);
            continue;
        }
        records.push({ reading: result, load: load.summary() });
    }

    return { records, refused, failed };
};
