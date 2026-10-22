/**
 * A PIECE: one scenario at one operating point, measured end to end and written
 * down.
 *
 * WHY THE GRAIN IS (POINT, SCENARIO). Four things are derived per scenario per
 * point and shared with no scenario beside it: the VERIFICATION (a scenario voids
 * at a point, alone); the SAMPLING PLAN, derived from that scenario's own
 * participants' probes; the RESOLUTION CONTROL, measured inside that table's
 * interleaved batch; and DRIFT, measured round by round across that table's rows,
 * which is what makes it the threshold deciding ties in that table.
 *
 * Split any finer — one adapter at a time — and all four break: the plan would be
 * invented before the participants were probed, the control would be measured in a
 * different sitting from the rows it attests, and the round-robin that makes drift
 * an error bar over the distance between two compared rows would be gone.
 *
 * SPLITTING COSTS ZERO EXTRA WARM-UP ITERATIONS. Warm-up is paid PER WORKER
 * PROCESS, and a piece spawns exactly the workers the batch spawned for that
 * scenario at that point; the batch amortised NOTHING across scenarios — every
 * worker is `execFileSync`'d fresh so no JIT or GC state crosses. A split adds one
 * RUNNER process and one `identity.ts` pass per piece, neither inside any clock.
 *
 * WHAT A PIECE HAS TO CARRY: enough to reprint its table exactly as a live run
 * would, and enough for the report to refuse it — the experiment (`identity.ts`),
 * the point's four numbers, the conditions (`load.ts`), and the RAW RESULTS of all
 * three phases rather than their conclusions. The conclusions are DERIVED at print
 * time by the same code that derives them live, so a stored piece and a fresh one
 * cannot be judged by two different rules.
 */
import type { TSamplingPlan } from './measure';
import type { TExperiment } from './identity';
import type { TLoadSummary } from './load';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bumped whenever a stored field changes meaning or disappears.
 *
 * A piece from an older format is reported as unusable rather than read
 * optimistically: a hole in a table reads as a measurement rather than a stale
 * file.
 */
export const PIECE_FORMAT = 1;

const here = dirname(fileURLToPath(import.meta.url));
const BENCH = join(here, '..', '..');

/** Where pieces live. Overridable so two experiments can be kept side by side. */
export const RESULTS_DIR = process.env.BENCH_RESULTS ?? join(BENCH, 'results');

/**
 * WHERE AN ARTIFACT LIVES — the one directory a published figure may name, and
 * NOT the one above. The two are not interchangeable and the difference is the
 * whole of C6; BENCHMARKING.md §6 has the table.
 */
export const MEASUREMENTS_DIR =
    process.env.BENCH_MEASUREMENTS ?? join(BENCH, 'measurements');

/**
 * WHAT THE TIMING HARNESS SUFFIX IS, in the naming scheme every measurement
 * directory follows: `<date>-<harness>/<piece>/`. `bench` is `src/bench.ts`, and it
 * is the harness whose artifacts nothing under `measurements/` currently is.
 */
const TIMING_ARTIFACT_SUFFIX = '-bench';

/**
 * EVERY RECORDED RUN OF THE TIMING HARNESS, BY NAME — derived from the disk, never
 * declared, and empty is the answer this returns today.
 *
 * C6 asks that every published figure name an artifact. For the timing tables it
 * has a blunter answer first: if no directory here was written by `bench` at all,
 * then NO number any timing table prints is a published figure, whatever the
 * per-(point, scenario) pieces in `results/` say. One read of one directory, so the
 * report performs it rather than asserting it, and the day somebody records a run
 * the sentence stops printing on its own.
 */
export const recordedTimingArtifacts = (): readonly string[] => {
    if (!existsSync(MEASUREMENTS_DIR)) return [];
    try {
        return readdirSync(MEASUREMENTS_DIR, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .filter(name => name.endsWith(TIMING_ARTIFACT_SUFFIX))
            .sort();
    } catch {
        // An unreadable measurements directory is reported as "none recorded",
        // which is the conservative answer: it makes the report say a figure has
        // no artifact rather than say it has one nobody opened.
        return [];
    }
};

/**
 * The operating point, as four numbers rather than as a name.
 *
 * The name alone would let a `custom` piece measured at one population read as a
 * `custom` piece measured at another, and would let a change to the sweep's
 * derivation pass unnoticed. A piece whose numbers no longer match the point its
 * key names is stale, and says which number changed.
 */
export type TPointRecord = {
    key: string;
    n: number;
    window: number;
    processes: number;
};

export type TCounterRecord = {
    deliveries: number;
    distinct: number;
    redundant: number;
};

/** What one adapter's process reported for the verification pass. */
export type TSignatureRecord = { name: string; signature: string };
export type TFailureRecord = { name: string; reason: string };
export type TCostRecord = { name: string; runMs: number };

/**
 * Phase 1, stored as what each process SAID rather than as the verdict. The
 * verdict is a function of these four lists, computed by one helper used by the
 * live path and the stored path alike.
 */
export type TVerificationRecord = {
    /** In participant order: adapter -> the answer it produced. */
    signatures: readonly TSignatureRecord[];
    /** adapter -> what the reference model produced in that adapter's process. */
    oracles: readonly TSignatureRecord[];
    failed: readonly TFailureRecord[];
    /** One line of what a consumer actually rendered. */
    evidence: string;
    /** Steps per run AT THIS POINT, as the workers here counted them. */
    steps?: number;
    /** Whether the comparison was on the final state rather than the sequence. */
    byFinalState: boolean;
};

/** Phase 2: what one run costs each participant, and the plan derived from it. */
export type TCalibrationRecord = {
    costs: readonly TCostRecord[];
    probeFailures: readonly TFailureRecord[];
    /** The plan actually handed to every worker — stored, not re-derived. */
    plan: TSamplingPlan;
};

/** One row of a timing table, controls included. */
export type TMeasuredRecord = {
    name: string;
    /** Every process's own minimum, sorted. The table's `min` is the first. */
    processMins: readonly number[];
    /** The best process's minimum: the floor this machine reached. */
    min: number;
    /**
     * (max - min) / min across independent processes.
     *
     * THIS IS THE TIE THRESHOLD, measured on this row's own code rather than
     * borrowed from a control: two rows closer together than the distance a row
     * travels between two runs of itself have not been told apart by this machine.
     * It belongs to the piece and nothing outside it.
     */
    drift: number;
    /** Processes that produced nothing. */
    lost: number;
    /**
     * (max - min) / min ACROSS THE SAMPLES OF ONE PROCESS — the process whose
     * minimum is this row's `min`, i.e. the FASTEST of the `processMins` above.
     *
     * IT AND `drift` COME FROM DIFFERENT POPULATIONS, though printed in adjacent
     * columns. `spread` is one process, many samples, and specifically the process
     * that WON — a conditioned statistic, since the winner is on average the
     * quietest process of the round, so it is biased LOW. `drift` is many
     * processes, one number each, interleaved round by round, so the interval it
     * covers is the interval the table's comparisons span.
     *
     * Neither bounds the other and neither is a component of the other. Spread 2%
     * with drift 40% is not a contradiction. ONLY `drift` IS THE TIE THRESHOLD;
     * `spread` attests nothing about a gap between two rows.
     */
    spread: number;
    repeat: number;
    samples: number;
    /** Warm-up iterations that process completed, against the plan's count. */
    warmed?: number;
    a: TCounterRecord;
    b: TCounterRecord;
};

export type TUnmeasuredRecord = { name: string; kind: string; reason: string };

export type TTimingRecord = {
    measured: readonly TMeasuredRecord[];
    unmeasured: readonly TUnmeasuredRecord[];
    /** At least one worker of this piece ran without --expose-gc. */
    gcMissing: boolean;
};

export type TScenarioPiece = {
    format: number;
    experiment: TExperiment;
    point: TPointRecord;
    scenario: string;
    /** ISO 8601, so the report can print how far apart its pieces were taken. */
    measuredAt: string;
    /** Wall clock the piece took, for scheduling the next one. */
    seconds: number;
    load: TLoadSummary;
    verification: TVerificationRecord;
    calibration: TCalibrationRecord;
    /** Absent exactly when the scenario voided: nothing was timed. */
    timing?: TTimingRecord;
};

/**
 * One row of the memory table, stored on disk and read back by anything quoting
 * it. `held` is a DIFFERENCE and is stored already subtracted; `baseline` is the
 * common floor it was taken against and is stored to be read BESIDE it, never
 * subtracted from it. See `TWorkerResult`'s `weighed` arm for both readings.
 */
export type TWeighedRecord = { name: string; baseline: number; held: number };

export type TMemoryPiece = {
    format: number;
    experiment: TExperiment;
    point: TPointRecord;
    measuredAt: string;
    seconds: number;
    load: TLoadSummary;
    weighed: readonly TWeighedRecord[];
    unweighed: readonly TFailureRecord[];
};

/**
 * Reading a piece has three outcomes and they are not the same finding: a piece
 * that was never measured is work to schedule, and a piece that cannot be read
 * is a file to look at.
 */
export type TStored<TPiece> =
    | { status: 'read'; piece: TPiece }
    | { status: 'missing' }
    | { status: 'unusable'; problem: string };

/** One file per piece, named after the two things that identify it. */
const scenarioPath = (pointKey: string, scenarioKey: string): string =>
    join(RESULTS_DIR, `timing--${pointKey}--${scenarioKey}.json`);

const memoryPath = (pointKey: string): string =>
    join(RESULTS_DIR, `memory--${pointKey}.json`);

const write = (path: string, piece: TScenarioPiece | TMemoryPiece): string => {
    mkdirSync(RESULTS_DIR, { recursive: true });
    // Indented and newline-terminated: a piece is evidence, and evidence that
    // cannot be diffed against the next one is worth less.
    writeFileSync(path, `${JSON.stringify(piece, undefined, 2)}\n`);
    return path;
};

export const saveScenarioPiece = (piece: TScenarioPiece): string =>
    write(scenarioPath(piece.point.key, piece.scenario), piece);

export const saveMemoryPiece = (piece: TMemoryPiece): string =>
    write(memoryPath(piece.point.key), piece);

const read = <TPiece extends { format: number }>(path: string): TStored<TPiece> => {
    if (!existsSync(path)) return { status: 'missing' };
    try {
        const piece = JSON.parse(readFileSync(path, 'utf8')) as TPiece;
        if (piece.format !== PIECE_FORMAT) {
            return {
                status: 'unusable',
                problem: `written in piece format ${piece.format}, this runner reads ${PIECE_FORMAT}`,
            };
        }
        return { status: 'read', piece };
    } catch (error) {
        return { status: 'unusable', problem: (error as Error).message };
    }
};

export const readScenarioPiece = (
    pointKey: string,
    scenarioKey: string
): TStored<TScenarioPiece> => read<TScenarioPiece>(scenarioPath(pointKey, scenarioKey));

export const readMemoryPiece = (pointKey: string): TStored<TMemoryPiece> =>
    read<TMemoryPiece>(memoryPath(pointKey));
