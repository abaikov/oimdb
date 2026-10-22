import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BenchLoad } from '../harness/load';
import { bundledWorkerPath } from '../harness/workerBundle';
import { hasSettled } from './measureRetainedArm';
import type { TRetainedArm } from './TRetainedArm';
import type { TRetainedArmReading } from './TRetainedArmReading';
import type { TRetainedPair } from './TRetainedPair';
import type { TRetainedReading } from './TRetainedReading';
import type { TRetainedRecord } from './TRetainedRecord';
import type { TRetainedRun } from './TRetainedRun';
import type { TRetainedWorkerOutput } from './TRetainedWorkerOutput';

/**
 * THE MEASURING HALF OF THE RETENTION HARNESS — three processes per pair.
 *
 * `off`, THEN `on`, THEN `off` AGAIN. Two builds of byte-identical code
 * straddling the thing being measured are the only per-row statement this harness
 * can make about drift, and their disagreement travels out with the number as the
 * row's own floor.
 *
 * ONE PROCESS AT A TIME AND THE PARENT WAITS ON IT. Two arms measured at once
 * would each be allocating while the other collected — precisely the interference
 * the settle loop is trying to remove.
 */

const here = dirname(fileURLToPath(import.meta.url));
// The worker is a program and sits beside the entry points, not inside the
// catalogue.
const workerPath = join(here, '..', 'retained-worker.ts');

/** Without `--expose-gc` this is not a retention measurement; see `attestRetainedRun`. */
const runWorker = (pairId: string, arm: TRetainedArm): TRetainedArmReading => {
    const out = execFileSync(
        process.execPath,
        ['--expose-gc', bundledWorkerPath(workerPath), pairId, arm],
        {
            encoding: 'utf8',
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16 * 1024 * 1024,
            timeout: 10 * 60 * 1000,
            killSignal: 'SIGKILL',
        },
    );
    const line = out.trim().split('\n').filter(Boolean).pop();
    if (line === undefined) throw new Error('the worker produced no output');
    const output = JSON.parse(line) as TRetainedWorkerOutput;
    if (output.status === 'failed') throw new Error(`${arm} arm: ${output.reason}`);
    return output.reading;
};

const largest = (values: readonly number[]): number =>
    values.reduce((most, value) => (value > most ? value : most), 0);

/**
 * THE THREE SPAWNS IN `measure` BELOW, counted for the load gate: off, on, off
 * again. One runs at a time, but all three are still inside the one-minute average
 * when the next pair reads it, so this is what the next pair is allowed for.
 */
const PROCESSES_PER_PAIR = 3;

const measure = (pair: TRetainedPair, load: BenchLoad): TRetainedReading | string => {
    try {
        load.sample();
        const offFirst = runWorker(pair.id, 'off');
        load.sample();
        const on = runWorker(pair.id, 'on');
        load.sample();
        const offAgain = runWorker(pair.id, 'off');
        load.sample();
        return assemble(pair, offFirst, on, offAgain);
    } catch (error) {
        const message = (error as Error).message ?? String(error);
        return message.split('\n').slice(0, 4).join(' / ');
    }
};

/**
 * Separate from the spawning above so the `try` covers only the spawns: a throw
 * there is a worker that produced no reading, a throw here is a bug in this file,
 * and the two must not be reported as the same thing.
 */
const assemble = (
    pair: TRetainedPair,
    offFirst: TRetainedArmReading,
    on: TRetainedArmReading,
    offAgain: TRetainedArmReading,
): TRetainedReading | string => {
    // THE ONE CHECK THAT FAILS A PAIR RATHER THAN MARKING IT. A disagreement
    // about the divisor means the two populations are not the same population
    // differing in one thing, which is the assumption every delta here rests on.
    if (offFirst.rows !== on.rows || offFirst.rows !== offAgain.rows) {
        return (
            `the arms disagree about the divisor: off ${offFirst.rows}, on ${on.rows}, ` +
            `off again ${offAgain.rows}. The two populations are not the same population ` +
            'apart from the thing under test.'
        );
    }

    const arms = [offFirst, on, offAgain];
    const deltaBytes = on.retainedBytes - offFirst.retainedBytes;
    const settles = [
        offFirst.baseline, offFirst.held, offFirst.released,
        on.baseline, on.held, on.released,
        offAgain.baseline, offAgain.held, offAgain.released,
    ];

    return {
        id: pair.id,
        path: pair.path,
        on: pair.on,
        off: pair.off,
        caveat: pair.caveat,
        isControl: pair.isControl === true,
        expectedBytesPerRow: pair.expectedBytesPerRow,
        onBytes: on.retainedBytes,
        offBytes: offFirst.retainedBytes,
        offAgainBytes: offAgain.retainedBytes,
        deltaBytes,
        noiseBytes: Math.abs(offAgain.retainedBytes - offFirst.retainedBytes),
        bytesPerRow: on.rows === 0 ? 0 : deltaBytes / on.rows,
        rows: on.rows,
        // The WORST disagreement between an arm's two directions, reported
        // rather than averaged: it is what says whether an arm left something
        // reachable after its root was dropped.
        residueBytes: largest(arms.map(reading => Math.abs(reading.residueBytes))),
        settleGapBytes: largest(settles.map(settle => settle.gapBytes)),
        settled: settles.every(hasSettled),
        arms,
        gcAvailable: arms.every(reading => reading.gcAvailable),
        node: on.node,
    };
};

/** The caller passes the controls first; this function does not add them. */
export const runRetainedPairs = (pairs: readonly TRetainedPair[]): TRetainedRun => {
    const records: TRetainedRecord[] = [];
    const refused: string[] = [];
    const failed: string[] = [];

    for (const pair of pairs) {
        const load = new BenchLoad(PROCESSES_PER_PAIR);
        const refusal = load.refusal();
        if (refusal !== undefined) {
            refused.push(`${pair.id}: ${refusal}`);
            continue;
        }
        // stderr, so a report piped to a file is the report and the progress is
        // still on the terminal.
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
