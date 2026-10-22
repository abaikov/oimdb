/**
 * TWO ARMS, ONE SCENARIO, ONE POINT — the same four phases the full report runs,
 * over two participants instead of sixteen. The worker is not touched, both arms
 * are verified against the plain-Map reference model by the same fold, and both
 * are timed in one interleaved round-robin with the resolution control in the
 * same batch: SELECTING ONE ADAPTER CANNOT CHANGE WHAT THE SCENARIO DOES.
 *
 * The sampling plan is derived ACROSS THE PARTICIPANT SET — `repeat` and `warmup`
 * from the MEDIAN probe, `samples` from the SLOWEST, the rule `calibrate` in
 * `cells/runBatch.ts` applies — so a set of two produces a
 * different plan from a set of sixteen and its milliseconds are not comparable
 * with a published table. Nothing here can repair that; the report declares it
 * and offers `borrowPlan`. THE RATIO SURVIVES IT, because both arms are measured
 * under one plan whatever that plan is.
 */
import { CellStore } from '../cells/cellStore';
import { samePoint } from '../cells/points';
import type { TPoint } from '../cells/types';
import { EXPERIMENT } from '../harness/identity';
import { BenchLoad } from '../harness/load';
import { medianOf, planFor } from '../harness/measure';
import type { TSamplingPlan } from '../harness/measure';
import { measureAll, reasonOf, runWorker } from '../harness/measureBatch';
import type { TMeasureRun } from '../harness/measureBatch';
import type { TCostRecord } from '../harness/pieces';
// Not from the registry that re-exports them: it imports every adapter — and
// therefore every library and the working-tree core — at module load.
import { CONTROL_HEAVY, CONTROL_LEAN } from '../harness/control';
import { answerOf } from '../harness/signature';
import type { TScenario } from '../harness/types';
import type {
    TDuelAnswer,
    TDuelControl,
    TDuelField,
    TDuelPlanSource,
    TDuelReading,
    TDuelRun,
} from './TDuelRun';

export type TDuelRequest = {
    armName: string;
    floorName: string;
    floorIsNaive: boolean;
    scenario: TScenario;
    point: TPoint;
    /** `controlsFor(scenario)` from `cells/participants.ts`, handed in for the registry reason below. */
    controls: readonly string[];
    /**
     * THE FIELD THESE TWO ARMS CAME OUT OF — see {@link TDuelField}. Handed in
     * rather than read here for this file's own stated reason: the registry
     * imports every adapter, and therefore every library and the working-tree
     * core, at module load. `duel.ts` already pays that import; this file must
     * not.
     */
    field: TDuelField;
    /** Take the plan the cell runner stored (`CellStore.planOf`) instead of deriving one. */
    borrowPlan: boolean;
};

/** The full runner's fallback: one run per sample, the estimator assuming least. */
const FALLBACK_PLAN: TSamplingPlan = { repeat: 1, samples: 9, warmup: 5 };

/**
 * THE PLAN THE CELL RUNNER STORED FOR THIS SCENARIO AT THIS POINT — the one
 * `runBatch` times every cell of it under — or the reason there is none. Only
 * the plan is read, so nothing measured before an edit reaches a table printed
 * after one.
 */
type TBorrowed =
    | { status: 'borrowed'; plan: TSamplingPlan; source: TDuelPlanSource }
    | { status: 'unavailable'; problem: string };

const borrowedPlan = (point: TPoint, scenario: TScenario): TBorrowed => {
    const stored = new CellStore().planOf(point.key, scenario.key);
    if (stored === undefined) {
        return {
            status: 'unavailable',
            problem:
                `no stored plan for ${point.key}/${scenario.key} — run ` +
                `\`npm run bench -- plan --point ${point.key} --scenario ${scenario.key}\` once, or ` +
                'drop --borrow-plan and let this run derive its own',
        };
    }
    if (!samePoint(stored.point, point)) {
        return {
            status: 'unavailable',
            problem:
                `the stored ${point.key} plan was calibrated at n=${stored.point.n}, window=` +
                `${stored.point.window}, processes=${stored.point.processes}, and this run is at ` +
                `n=${point.n}, window=${point.window}, processes=${point.processes}`,
        };
    }
    return {
        status: 'borrowed',
        plan: stored.plan,
        source: {
            kind: 'borrowed',
            pointKey: stored.point.key,
            scenario: stored.scenario,
            probedAt: stored.probedAt,
            participants: stored.probes.length,
        },
    };
};

export const runDuel = (request: TDuelRequest): TDuelRun => {
    const { armName, floorName, scenario, point } = request;
    const names = [floorName, armName] as const;
    const run: TMeasureRun = { load: new BenchLoad(point.processes), gcMissing: false };
    const started = Date.now();

    const base = {
        armName,
        floorName,
        floorIsNaive: request.floorIsNaive,
        field: request.field,
        scenarioKey: scenario.key,
        scenarioLabel: scenario.label,
        scenarioDescription: scenario.description,
        point,
        byFinalState: scenario.finalStateOnly === true,
        perGroup: scenario.perGroup === true,
        controlsAsked: request.controls.length > 0,
        experiment: EXPERIMENT,
        node: process.version,
        measuredAt: new Date().toISOString(),
    };

    // FIRST, BEFORE A SINGLE PROCESS IS SPAWNED: a run refused here has cost
    // nothing.
    const refusal = run.load.refusal();
    if (refusal !== undefined) {
        return {
            ...base,
            refusal,
            answers: [],
            problems: [],
            load: run.load.summary(),
            gcMissing: false,
            seconds: (Date.now() - started) / 1000,
        };
    }

    /* ── 1. verify: did either arm do the work the script describes ───────── */

    const answers: TDuelAnswer[] = [];
    let steps: number | undefined;
    let voidReason: string | undefined;

    for (const name of names) {
        const result = runWorker(name, scenario.key, 'verify', point, run);
        if (result.status !== 'ok') {
            answers.push({ name, problem: reasonOf(result, 'verification') });
            continue;
        }
        if (steps === undefined) steps = result.steps;
        const answered = answerOf(result, base.byFinalState);
        if (answered.status === 'unanswerable') {
            answers.push({ name, problem: answered.problem });
            continue;
        }
        answers.push({ name, signature: answered.signature, oracle: answered.oracle });
    }

    const unanswered = answers.filter(answer => answer.signature === undefined);
    if (unanswered.length > 0) {
        voidReason =
            `${unanswered.map(answer => answer.name).join(' and ')} produced no answer at all`;
    } else {
        const oracles = new Set(answers.map(answer => answer.oracle));
        if (oracles.size > 1) {
            // No library is involved in the reference model, so this is the
            // instrument being broken rather than either arm.
            voidReason =
                'THE REFERENCE MODEL DISAGREED WITH ITSELF between the two processes — same script, ' +
                'same dataset, no library involved';
        } else {
            const wrong = answers.filter(answer => answer.signature !== answer.oracle);
            if (wrong.length > 0) {
                voidReason =
                    `${wrong.map(answer => answer.name).join(' and ')} did not produce the states the ` +
                    'script describes';
            }
        }
    }

    if (voidReason !== undefined) {
        return {
            ...base,
            steps,
            answers,
            voidReason,
            problems: [],
            load: run.load.summary(),
            gcMissing: run.gcMissing,
            seconds: (Date.now() - started) / 1000,
        };
    }

    /* ── 2. calibrate: ONE plan, and where it came from ───────────────────── */

    let plan: TSamplingPlan = FALLBACK_PLAN;
    let planSource: TDuelPlanSource = { kind: 'derived', costs: [] };
    const problems: string[] = [];

    const borrowed = request.borrowPlan ? borrowedPlan(point, scenario) : undefined;
    if (borrowed !== undefined && borrowed.status === 'borrowed') {
        plan = borrowed.plan;
        planSource = borrowed.source;
    } else {
        if (borrowed !== undefined) {
            problems.push(`--borrow-plan could not be honoured: ${borrowed.problem}`);
        }
        const costs: TCostRecord[] = [];
        for (const name of names) {
            const result = runWorker(name, scenario.key, 'probe', point, run);
            if (result.status !== 'probed') {
                problems.push(`no probe from ${name}: ${reasonOf(result, 'calibration')}`);
                continue;
            }
            costs.push({ name, runMs: result.runMs });
        }
        if (costs.length > 0) {
            // A median of two is their mean, and the report says so.
            const slowest = costs.reduce((worst, cost) => Math.max(worst, cost.runMs), -Infinity);
            const cap = scenario.rebuild || !scenario.repeatable ? 1 : 512;
            plan = planFor(slowest, cap, medianOf(costs.map(cost => cost.runMs)));
        }
        planSource = { kind: 'derived', costs };
    }

    /* ── 3. time: both arms and the control, one interleaved batch ────────── */

    const timing = measureAll(
        [...request.controls, ...names],
        scenario.key,
        plan,
        point,
        run
    );
    const measured = new Map(timing.measured.map(row => [row.name, row] as const));
    for (const row of timing.unmeasured) {
        problems.push(`${row.name}: ${row.kind.toUpperCase()} — ${row.reason}`);
    }

    const armRow = measured.get(armName);
    const floorRow = measured.get(floorName);
    const reading: TDuelReading | undefined =
        armRow === undefined || floorRow === undefined
            ? undefined
            : {
                  arm: armRow,
                  floor: floorRow,
                  ratio: floorRow.min === 0 ? Infinity : armRow.min / floorRow.min,
                  // The errors of a quotient's two halves ADD — see the note on
                  // `TDuelReading.noise`.
                  noise: armRow.drift + floorRow.drift,
              };

    const lean = measured.get(CONTROL_LEAN);
    const heavy = measured.get(CONTROL_HEAVY);
    const control: TDuelControl | undefined =
        lean === undefined || heavy === undefined
            ? undefined
            : {
                  lean,
                  heavy,
                  gap: lean.min === 0 ? 0 : (heavy.min - lean.min) / lean.min,
                  drift: Math.max(lean.drift, heavy.drift),
              };

    return {
        ...base,
        steps,
        answers,
        plan,
        planSource,
        reading,
        control,
        problems,
        load: run.load.summary(),
        gcMissing: timing.gcMissing,
        seconds: (Date.now() - started) / 1000,
    };
};
