import { BenchLoad } from '../harness/load';
import { medianOf, planFor } from '../harness/measure';
import { measureAll, reasonOf, runWorker } from '../harness/measureBatch';
import type { TMeasureRun } from '../harness/measureBatch';
import type { TMeasuredRecord } from '../harness/pieces';
import { answerOf } from '../harness/signature';
import { CONTROL_HEAVY, CONTROL_LEAN, CONTROL_WRITE } from '../harness/registry';
import type { TScenario } from '../harness/types';
import type { IFingerprintSource } from './fingerprint';
import type { CellStore } from './cellStore';
import { CURRENT_ENVIRONMENT } from './environment';
import { anchorFor, controlsFor, eligibleOf } from './participants';
import type {
    TAnchorReading,
    TBatchRecord,
    TCellOutcome,
    TCellRecord,
    TFingerprint,
    TMeasuredOutcome,
    TPlanRecord,
    TPoint,
    TResolution,
} from './types';

export type TBatchRequest = {
    point: TPoint;
    scenario: TScenario;
    adapterNames: readonly string[];
};

export type TBatchResult =
    | { status: 'refused'; reason: string }
    | { status: 'done'; batch: TBatchRecord; records: readonly TCellRecord[] };

export type TBatchLog = (line: string) => void;

const calibrate = (
    point: TPoint,
    scenario: TScenario,
    run: TMeasureRun,
    harness: string,
    log: TBatchLog
): TPlanRecord => {
    const probes: { name: string; runMs: number }[] = [];
    const probeFailures: { name: string; reason: string }[] = [];
    for (const adapter of eligibleOf(scenario)) {
        const result = runWorker(adapter.name, scenario.key, 'probe', point, run);
        if (result.status === 'probed') probes.push({ name: adapter.name, runMs: result.runMs });
        else probeFailures.push({ name: adapter.name, reason: reasonOf(result, 'calibration') });
    }
    if (probes.length === 0) {
        throw new Error(`${point.key}/${scenario.key}: no participant answered the probe`);
    }
    const costs = probes.map(probe => probe.runMs);
    const cap = scenario.rebuild || !scenario.repeatable ? 1 : 512;
    const plan = planFor(Math.max(...costs), cap, medianOf(costs));
    log(
        `  plan ${point.key}/${scenario.key}: ×${plan.repeat} runs per sample, ${plan.samples} samples, ` +
            `${plan.warmup} warm-up, from ${probes.length} probes`
    );
    return {
        format: 2,
        point,
        scenario: scenario.key,
        plan,
        probes,
        probeFailures,
        probedAt: new Date().toISOString(),
        harness,
    };
};

const verifyAdapter = (
    name: string,
    point: TPoint,
    scenario: TScenario,
    run: TMeasureRun
): Exclude<TCellOutcome, TMeasuredOutcome> | undefined => {
    const result = runWorker(name, scenario.key, 'verify', point, run);
    if (result.status !== 'ok') {
        return { status: 'failed', phase: 'verify', reason: reasonOf(result, 'verification') };
    }
    const answer = answerOf(result, scenario.finalStateOnly === true);
    if (answer.status === 'unanswerable') {
        return { status: 'failed', phase: 'verify', reason: answer.problem };
    }
    if (answer.signature !== answer.oracle) {
        return { status: 'disagrees', signature: answer.signature, oracle: answer.oracle };
    }
    return undefined;
};

const pairReadingOf = (lean: TMeasuredRecord, arm: TMeasuredRecord) => {
    const gap = (arm.min - lean.min) / lean.min;
    const drift = Math.max(lean.drift, arm.drift);
    return { gap, drift, resolved: gap > drift };
};

const resolutionOf = (measured: readonly TMeasuredRecord[]): TResolution | undefined => {
    const lean = measured.find(record => record.name === CONTROL_LEAN);
    const heavy = measured.find(record => record.name === CONTROL_HEAVY);
    const write = measured.find(record => record.name === CONTROL_WRITE);
    if (lean === undefined || heavy === undefined || lean.min <= 0) return undefined;
    return {
        leanMin: lean.min,
        heavyMin: heavy.min,
        ...pairReadingOf(lean, heavy),
        fine: write === undefined ? undefined : { writeMin: write.min, ...pairReadingOf(lean, write) },
    };
};

const measuredOutcomeOf = (
    record: TMeasuredRecord,
    anchor: TAnchorReading | undefined
): TCellOutcome => ({
    status: 'measured',
    min: record.min,
    processMins: record.processMins,
    drift: record.drift,
    lost: record.lost,
    spread: record.spread,
    repeat: record.repeat,
    samples: record.samples,
    warmed: record.warmed,
    a: record.a,
    b: record.b,
    ratioToAnchor: anchor === undefined || anchor.min <= 0 ? undefined : record.min / anchor.min,
});

export const runBatch = async (
    request: TBatchRequest,
    store: CellStore,
    fingerprintSource: IFingerprintSource,
    log: TBatchLog
): Promise<TBatchResult> => {
    const { point, scenario } = request;
    const load = new BenchLoad(point.processes);
    const refusal = load.refusal();
    if (refusal !== undefined) return { status: 'refused', reason: refusal };

    const run: TMeasureRun = { load, gcMissing: false };
    const startedAt = new Date();
    const harness = await fingerprintSource.harnessDigest();

    let planRecord = store.planOf(point.key, scenario.key);
    if (planRecord === undefined) {
        planRecord = calibrate(point, scenario, run, harness, log);
        store.savePlan(planRecord);
    }
    const plan = planRecord.plan;

    const anchor = anchorFor(scenario);
    const recorded = [...new Set([...(anchor === undefined ? [] : [anchor]), ...request.adapterNames])];
    const fingerprints = new Map<string, TFingerprint>();
    for (const name of recorded) fingerprints.set(name, await fingerprintSource.fingerprintOf(name));
    const outcomes = new Map<string, TCellOutcome>();
    for (const name of recorded) {
        const problem = verifyAdapter(name, point, scenario, run);
        if (problem !== undefined) {
            outcomes.set(name, problem);
            log(`  ${name}: ${problem.status === 'disagrees' ? 'DISAGREES with the model' : problem.reason}`);
        }
    }

    const timed = recorded.filter(name => !outcomes.has(name));
    const names = [...controlsFor(scenario), ...timed];
    log(
        `  timing ${names.join(', ')} — ${point.processes} process(es) × ${plan.samples} sample(s) × ` +
            `${plan.repeat} run(s) = ${point.processes * plan.samples * plan.repeat} timed runs each`
    );
    const timing = measureAll(names, scenario.key, plan, point, run);

    const anchorRecord = timing.measured.find(record => record.name === anchor);
    const anchorReading: TAnchorReading | undefined =
        anchorRecord === undefined
            ? undefined
            : { name: anchorRecord.name, min: anchorRecord.min, drift: anchorRecord.drift };
    for (const record of timing.measured) {
        if (timed.includes(record.name)) outcomes.set(record.name, measuredOutcomeOf(record, anchorReading));
    }
    for (const missing of timing.unmeasured) {
        if (timed.includes(missing.name)) {
            outcomes.set(missing.name, { status: 'failed', phase: 'time', reason: missing.reason });
        }
    }

    const batch: TBatchRecord = {
        id: `${point.key}--${scenario.key}--${startedAt.toISOString()}`,
        point,
        scenario: scenario.key,
        adapterNames: names,
        startedAt: startedAt.toISOString(),
        seconds: (Date.now() - startedAt.getTime()) / 1000,
        load: load.summary(),
        gcMissing: timing.gcMissing,
        resolution: resolutionOf(timing.measured),
        anchor: anchorReading,
    };

    const records: TCellRecord[] = [];
    for (const name of recorded) {
        const outcome = outcomes.get(name);
        const fingerprint = fingerprints.get(name);
        if (outcome === undefined || fingerprint === undefined) continue;
        records.push({
            format: 2,
            key: { point: point.key, scenario: scenario.key, adapter: name },
            fingerprint,
            environment: CURRENT_ENVIRONMENT,
            plan,
            batch,
            outcome,
            measuredAt: new Date().toISOString(),
        });
    }
    store.saveCells(records);
    store.appendBatch(batch);
    return { status: 'done', batch, records };
};
