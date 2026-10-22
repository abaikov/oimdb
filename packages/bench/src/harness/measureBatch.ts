/**
 * HOW A WORKER IS SPAWNED, AND HOW A SET OF THEM IS MEASURED AGAINST EACH OTHER
 * — in one place, because two runners (`bench.ts` and `duel.ts`) have to do it the
 * same way. A second copy would be a second answer to questions that must have
 * exactly one: what environment a worker runs under (`NODE_ENV=production`,
 * below), what a worker's answer looks like (`TWorkerResult`), and in what order
 * several names are timed (round by round, see `measureAll`).
 *
 * Nothing here decides WHICH names are measured or what is done with the
 * numbers. The two runners answer that differently on purpose.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { TSamplingPlan } from './measure';
import { BenchLoad } from './load';
import { PROCESSES_PER_VARIANT } from './processes';
import type {
    TMeasuredRecord,
    TTimingRecord,
    TUnmeasuredRecord,
} from './pieces';

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, '..', 'worker.ts');

/**
 * THE DIALS A WORKER IS SPAWNED AT — the three fields of an operating point that
 * a MEASUREMENT depends on. A structurally wider point, such as `cells/types.ts`'s
 * `TPoint`, passes straight in.
 */
export type TMeasurePoint = {
    /** How many rows exist. */
    n: number;
    /** How many rows of a view the consumer formats. */
    window: number;
    /** How many independent processes measure one row. */
    processes: number;
};

export type TWorkerCounters = {
    deliveries: number;
    distinct: number;
    redundant: number;
    rows?: number;
    head?: string;
};

export type TWorkerOk = {
    status: 'ok';
    digestA?: number;
    digestB?: number;
    /**
     * HOW MANY SCRIPT STEPS ONE RUN PERFORMED, as the worker counted them.
     *
     * Reported rather than read from `scenario.steps` in the runner's process:
     * half the scripts derive their step count from the window, and the runner's
     * `dataset.ts` was imported at the DEFAULT window, so it would caption a
     * table measured at 100 with 32 steps. Verify pass only.
     */
    steps?: number;
    /**
     * What the reference model produced for the same script. Present in the
     * verify pass and nowhere else — the timing pass does not replay it, because
     * nothing about the answer changes between processes.
     */
    oracleA?: number;
    oracleB?: number;
    oracleDistinctA?: number;
    oracleDistinctB?: number;
    /**
     * THE STATE EACH VIEW WAS LEFT SHOWING, adapter and reference model, with
     * the row count beside each digest.
     *
     * Present only for a scenario that set `TScenario.finalStateOnly`; for every
     * other one these are absent and the sequence digest is the only thing
     * compared.
     */
    stateA?: number;
    stateB?: number;
    oracleStateA?: number;
    oracleStateB?: number;
    oracleRowsA?: number;
    oracleRowsB?: number;
    min?: number;
    median?: number;
    max?: number;
    spread?: number;
    samples?: number;
    repeat?: number;
    /**
     * How many warm-up iterations this process actually completed — see
     * `TTiming.warmed`. Both runners print the shortfall under the table.
     */
    warmed?: number;
    gcAvailable?: boolean;
    a: TWorkerCounters;
    b: TWorkerCounters;
};

export type TWorkerResult =
    | TWorkerOk
    | { status: 'probed'; runMs: number; runs: number; gcAvailable?: boolean }
    /**
     * The memory pass. `baseline` is the process's heap before `bind()` — node,
     * tsx, the dataset, the consumers, and every adapter's module graph, since
     * `registry.ts` imports all of them into every worker. That is why it is the
     * same ~26 MB for every row: it is taken before this library's store exists
     * and is a floor common to the column, not a baseline for one adapter.
     *
     * `held` IS ALREADY THE DIFFERENCE — `heapUsed` after the load MINUS that
     * baseline, subtracted in `worker.ts` before it is emitted — and NOT a second
     * absolute reading. Subtracting the two fields again yields −12 to −25 MB for
     * every row, which has been done off this piece; the two fields are stored
     * side by side so a reader can see what the delta was taken against.
     *
     * There is no `gcAvailable` here because that mode refuses to produce a
     * figure without a collector rather than producing one and flagging it.
     */
    | { status: 'weighed'; baseline: number; held: number }
    | { status: 'failed'; reason: string }
    | { status: 'crashed'; reason: string };

/**
 * Why a worker gave a phase nothing it could use. Anything but the one shape a
 * phase wants is either a reported failure or a bug in the runner rather than in
 * the library — and reads that way only if the phase says which shape it wanted.
 */
export const reasonOf = (result: TWorkerResult, wanted: string): string =>
    result.status === 'failed' || result.status === 'crashed'
        ? result.reason
        : `a "${result.status}" result in the ${wanted} pass`;

/**
 * WHAT ONE RUN ACCUMULATES WHILE ITS WORKERS RUN — carried explicitly rather
 * than kept in a module variable, because a report assembled from pieces has to
 * say WHICH piece a condition happened in, and a global cannot.
 */
export type TMeasureRun = {
    /** Sampled at every spawn; becomes the run's conditions record. */
    load: BenchLoad;
    /** Set by any worker of this run that reported it did not get --expose-gc. */
    gcMissing: boolean;
};

/**
 * A fresh set of conditions, read before the first worker is spawned.
 *
 * THIS RUNNER IS THE ONE THAT SPENDS MORE THAN ONE, so it is the one that says
 * so: the load gate allows for what its caller actually drives, and the two
 * serial runners take the default of 1.
 */
export const startMeasureRun = (): TMeasureRun => ({
    load: new BenchLoad(PROCESSES_PER_VARIANT),
    gcMissing: false,
});

export const runWorker = (
    adapter: string,
    scenario: string,
    mode: 'verify' | 'probe' | 'time' | 'memory',
    point: TMeasurePoint,
    run: TMeasureRun,
    plan?: TSamplingPlan
): TWorkerResult => {
    // Read where a process spawn is already being paid for, so no measurement
    // ever contains it: nothing samples the load between a clock start and a
    // clock stop.
    run.load.sample();
    const args = [
        '--expose-gc',
        '--import',
        'tsx',
        workerPath,
        adapter,
        scenario,
        String(point.n),
        mode,
    ];
    if (plan !== undefined) {
        args.push(String(plan.repeat), String(plan.samples), String(plan.warmup));
    }
    try {
        const out = execFileSync(process.execPath, args, {
            encoding: 'utf8',
            env: {
                ...process.env,
                /**
                 * EVERY WORKER RUNS AS PRODUCTION, and this line is worth more
                 * than any other in this file. `mobx`'s `node` export condition
                 * resolves to `dist/index.js`, which picks the production or the
                 * development build from `process.env.NODE_ENV` at require time;
                 * left unset, the harness measures MobX's debug build and prints
                 * it as MobX. The same mechanism, smaller, reaches Immer and hence
                 * redux-toolkit.
                 *
                 * Set here rather than in the caller's shell so the answer cannot
                 * depend on who ran it, and in THIS file rather than in each
                 * runner so a second runner cannot forget it.
                 */
                NODE_ENV: 'production',
                /**
                 * THE OPERATING POINT, and the whole mechanism by which a report
                 * has more than one. The window is a module-level constant in
                 * `dataset.ts` read from the environment at import time, so a
                 * worker spawned with a different value here IS a worker at a
                 * different point — plan, consumer capacity, step counts and the
                 * consumer lower bound all follow from it inside that process.
                 *
                 * `BENCH_N` is exported although the worker reads the population
                 * from its argument list, so a worker command line copied out of a
                 * crash report reproduces the point it crashed at.
                 */
                BENCH_N: String(point.n),
                BENCH_WINDOW: String(point.window),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024,
            timeout: 5 * 60 * 1000,
            killSignal: 'SIGKILL',
        });
        const line = out.trim().split('\n').filter(Boolean).pop();
        if (line === undefined) return { status: 'crashed', reason: 'no output' };
        const result = JSON.parse(line) as TWorkerResult;
        if (
            (result.status === 'ok' || result.status === 'probed') &&
            result.gcAvailable === false
        ) {
            run.gcMissing = true;
        }
        return result;
    } catch (error) {
        const message = (error as Error).message ?? String(error);
        return { status: 'crashed', reason: message.split('\n').slice(0, 3).join(' / ') };
    }
};

/**
 * EVERY NAME IN A BATCH, MEASURED ROUND BY ROUND RATHER THAN ROW BY ROW:
 * replicate 1 of every row, then replicate 2, then replicate 3.
 *
 * Row by row confounds anything that drifts over the tens of minutes a report
 * takes with a row's POSITION IN THE REGISTRY, which never changes. It also made
 * `drift` the wrong error bar: processes launched seconds apart agree closely,
 * and that small number was then used as the threshold deciding whether two rows
 * measured ten minutes apart are tied. Round by round makes `drift` cover the
 * same interval as the comparison it adjudicates.
 *
 * THE PROPERTY WEAKENS ON A BATCH OF TWO: a four-name round is shorter, so drift
 * is SMALLER and the tie threshold TIGHTER — the one direction that could flatter
 * a difference. The two-arm report says so beside its ratio.
 *
 * The start offset rotates by round, so no name is systematically first — first
 * position is the one that pays for whatever the previous round left behind.
 */
export const measureAll = (
    names: readonly string[],
    scenario: string,
    plan: TSamplingPlan,
    point: TMeasurePoint,
    run: TMeasureRun
): TTimingRecord => {
    const mins = new Map<string, number[]>();
    const best = new Map<string, TWorkerOk>();
    const failure = new Map<string, { kind: string; reason: string }>();
    for (const name of names) mins.set(name, []);

    for (let round = 0; round < point.processes; round++) {
        for (let i = 0; i < names.length; i++) {
            const name = names[(i + round) % names.length];
            const result = runWorker(name, scenario, 'time', point, run, plan);
            if (result.status !== 'ok') {
                // NOT a skip of the whole row. One flake used to cost the two
                // good processes beside it.
                failure.set(name, { kind: result.status, reason: reasonOf(result, 'timing') });
                continue;
            }
            const min = result.min ?? 0;
            mins.get(name)?.push(min);
            const held = best.get(name);
            if (held === undefined || min < (held.min ?? Infinity)) best.set(name, result);
        }
    }

    const measured: TMeasuredRecord[] = [];
    const unmeasured: TUnmeasuredRecord[] = [];
    for (const name of names) {
        const taken = mins.get(name) ?? [];
        const winner = best.get(name);
        if (winner === undefined) {
            const why = failure.get(name);
            unmeasured.push({
                name,
                kind: why?.kind ?? 'crashed',
                reason: why?.reason ?? 'no process produced a result',
            });
            continue;
        }
        taken.sort((a, b) => a - b);
        const low = taken[0];
        const high = taken[taken.length - 1];
        measured.push({
            name,
            min: low,
            processMins: taken,
            drift: taken.length < 2 || low === 0 ? 0 : (high - low) / low,
            lost: point.processes - taken.length,
            // From the best process — the counters printed beside a time have to
            // be that process's, or the row is two processes read as one. That
            // makes `spread` a different population from `drift` two lines above;
            // see `TMeasuredRecord.spread`.
            spread: winner.spread ?? 0,
            repeat: winner.repeat ?? 1,
            samples: winner.samples ?? 0,
            warmed: winner.warmed,
            a: {
                deliveries: winner.a.deliveries,
                distinct: winner.a.distinct,
                redundant: winner.a.redundant,
            },
            b: {
                deliveries: winner.b.deliveries,
                distinct: winner.b.distinct,
                redundant: winner.b.redundant,
            },
        });
    }
    // Every worker of this batch has now run — verification and calibration
    // included, since they share the `TMeasureRun` — so this is the whole run's
    // answer to "did anything run without a collector".
    return { measured, unmeasured, gcMissing: run.gcMissing };
};
