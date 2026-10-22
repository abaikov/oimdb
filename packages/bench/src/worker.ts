// One adapter, one scenario, one process; modes verify | probe | time | memory.
// The measurement protocol — what each mode proves, what the memory baseline
// holds, why gc runs twice, what the proof pass covers — is in `README.md#worker`.
import {
    foldGroupDigests,
    makeConsumers,
    makeGroupConsumers,
    resetGroupConsumers,
    totalGroupCounters,
} from './harness/consumer';
import {
    cloneOwners,
    cloneRows,
    compareRows,
    GROUP_A,
    GROUP_B,
    GROUP_NAMES,
    makeOwners,
    makePlan,
    makeRows,
    SINGLE_BYSTANDER,
    SINGLE_NAME,
    SINGLE_SEEDS,
    WINDOW,
} from './harness/dataset';
import type { TOwner, TRow } from './harness/dataset';
import { firstDeliveredShapeMismatch } from './harness/floor';
import { setChurnReadsAudited } from './harness/render';
import { time } from './harness/measure';
import {
    BenchOracle,
    firstGroupingMismatch,
    firstOwnerMismatch,
    firstPairMismatch,
    firstPopulationMismatch,
    firstSingleMismatch,
} from './harness/oracle';
import { finalStateSignatureOf, signatureOf } from './harness/signature';
import { loadParticipant } from './harness/participantModules';
// Importing the sentinel also loads the memory pass's standing, so its checks run
// in this process as well as in the runner.
import { NO_SCENARIO } from './harness/memoryPass';
import { isStoreless, scenarioByKey } from './harness/scenarios';
import type {
    TBinding,
    TCellConfig,
    TChurnBinding,
    TReadBinding,
    TRelationBinding,
    TRelationConfig,
    TScenarioContext,
    TSingleBinding,
    TSingleConfig,
} from './harness/types';

const [adapterName, scenarioKey, sizeArg, mode, repeatArg, samplesArg, warmupArg] =
    process.argv.slice(2);
const N = Number(sizeArg);

const emit = (result: unknown): void => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
};

const exposedGc = (globalThis as { gc?: () => void }).gc;
const gcAvailable = exposedGc !== undefined;
const collect = (): void => {
    if (exposedGc !== undefined) exposedGc();
};

// Before the participant loads: a read of the native `process.env` is a C++ lookup a bundler would have inlined.
process.env = { ...process.env };

const adapter = await loadParticipant(adapterName);

const rows = makeRows(N);
const plan = makePlan(rows);
const rowById = new Map(rows.map(row => [row.id, row]));
const view = { groupA: GROUP_A, groupB: GROUP_B, window: WINDOW };
// Room to spare: a view may briefly hold more than a window.
const consumers = makeConsumers(WINDOW * 2);
// Built for every worker whichever script it was spawned for, and BEFORE the
// memory mode takes its baseline, so it is the same constant in front of every
// adapter alike rather than a function of which scenario was asked for.
const groupConsumers = makeGroupConsumers(GROUP_NAMES, WINDOW * 2);

// Built here, before the memory baseline, for `groupConsumers`' reason. A copy:
// an adapter is never given the harness's own row objects — see
// `TScenarioContext.loadRows`.
const loadRows = cloneRows(rows);

const buildTwoViews = (): TBinding => adapter.bind(consumers, view, plan);

// ── what the store HOLDS ────────────────────────────────────────────────────

if (mode === 'memory') {
    if (scenarioKey !== NO_SCENARIO) {
        emit({
            status: 'failed',
            reason:
                `the memory mode runs no script, so it takes "${NO_SCENARIO}" in the scenario slot ` +
                `and was given "${scenarioKey}". A scenario key there would claim the figure belongs ` +
                'to that row of the report, and it belongs to none of them.',
        });
        process.exit(0);
    }
    if (!gcAvailable) {
        emit({
            status: 'failed',
            reason:
                'the memory mode needs --expose-gc: without a collection on both sides of the load, ' +
                'the difference is the allocation history of the write path rather than what the ' +
                'store holds. No figure is reported.',
        });
        process.exit(0);
    }

    collect();
    collect();
    const baseline = process.memoryUsage().heapUsed;

    const binding = buildTwoViews();
    // Before the write: the empty delivery some libraries make on subscribe is
    // not a state this measurement continues from.
    consumers.a.reset(true);
    consumers.b.reset(true);
    binding.write(loadRows);
    binding.settle();

    collect();
    collect();
    const loaded = process.memoryUsage().heapUsed;

    // Read before the binding is given back, so it describes the heap that was
    // just weighed.
    const visible = Math.min(WINDOW, plan.groupSize);
    const failure =
        consumers.a.distinct !== 1 || consumers.b.distinct !== 1
            ? `the load produced ${consumers.a.distinct}/${consumers.b.distinct} distinct renders ` +
              'across the two views, and one each is what a load from empty is'
            : consumers.a.rowCount() !== visible
              ? `view A shows ${consumers.a.rowCount()} rows after the load, not ${visible}`
              : undefined;
    // Also the keep-alive: disposing before the second reading would let the
    // binding be collected out of the heap being weighed.
    binding.dispose();

    // `held` is ALREADY the delta, not an absolute heap reading.
    emit(
        failure === undefined
            ? { status: 'weighed', baseline, held: loaded - baseline }
            : { status: 'failed', reason: failure }
    );
    process.exit(0);
}

const scenario = scenarioByKey(scenarioKey);
const storeless = isStoreless(scenario);

const deletedRows: TRow[] = [];
for (const id of plan.windowA) {
    const row = rowById.get(id);
    if (row !== undefined) deletedRows.push({ ...row });
}

// One page — exactly what view A shows — for the re-send scenario. WAS: the
// whole population, twice, which measured population size beside rows measuring
// page-sized work; a re-send is a refetch of the page on screen (`scenarios.ts`).
const windowRows: TRow[] = [];
for (const id of plan.windowA) {
    const row = rowById.get(id);
    if (row !== undefined) windowRows.push(row);
}

// ONE object handed to `pin` and to the reference model alike, so the addresses
// an adapter resolved and the addresses the checker formats cannot drift apart.
const pinnedRanks: number[] = [];
for (const id of plan.pinned) {
    const row = rowById.get(id);
    if (row !== undefined) pinnedRanks.push(row.rank);
}
const cells: TCellConfig = { ids: plan.pinned, ranks: pinnedRanks };

// The second population. ONE object for `cells`' reason — a mismatch in the
// audit is then a mismatch in the STORE, not in two copies of the input — and
// ALWAYS built, for `groupConsumers`' reason.
const owners: readonly TOwner[] = makeOwners();
const loadOwners = cloneOwners(owners);
const relationConfig: TRelationConfig = {
    ids: plan.relationRows,
    ranks: plan.relationRanks,
    owners: plan.relationRowOwners,
    touched: plan.relationOwners,
    names: plan.relationNames,
    seeds: plan.pairSeeds,
};

// ONE object for `cells`' reason, ALWAYS built for `groupConsumers`' reason, and
// from constants: a single value is not part of the population, so nothing about
// it follows from the operating point.
const singleConfig: TSingleConfig = {
    name: SINGLE_NAME,
    bystander: SINGLE_BYSTANDER,
    seeds: SINGLE_SEEDS,
};

// The runner already keeps the decliners out of the column (`participantsOf`),
// so an absent builder here means a worker was spawned by hand for a pair that
// has no row — and the library's reason is printed rather than a crash.
const churnBuild =
    scenario.churn === undefined ? undefined : adapter.churn[scenario.churn].build;
if (scenario.churn !== undefined && churnBuild === undefined) {
    emit({
        status: 'failed',
        reason:
            `${adapter.name} supplies no ${scenario.churn} subscription wiring, so it has no row on ` +
            `"${scenario.key}": ${adapter.churn[scenario.churn].absent}`,
    });
    process.exit(0);
}

const readBuild =
    scenario.read === undefined ? undefined : adapter.reads[scenario.read].build;
if (scenario.read !== undefined && readBuild === undefined) {
    emit({
        status: 'failed',
        reason:
            `${adapter.name} supplies no ${scenario.read} read wiring, so it has no row on ` +
            `"${scenario.key}": ${adapter.reads[scenario.read].absent}`,
    });
    process.exit(0);
}

const relationBuild =
    scenario.relation === true ? adapter.relations.build : undefined;
if (scenario.relation === true && relationBuild === undefined) {
    emit({
        status: 'failed',
        reason:
            `${adapter.name} supplies no relationship wiring, so it has no row on ` +
            `"${scenario.key}": ${adapter.relations.absent}`,
    });
    process.exit(0);
}

const singleBuild = scenario.single === true ? adapter.single.build : undefined;
if (scenario.single === true && singleBuild === undefined) {
    emit({
        status: 'failed',
        reason:
            `${adapter.name} supplies no single-value wiring, so it has no row on ` +
            `"${scenario.key}": ${adapter.single.absent}`,
    });
    process.exit(0);
}

// Each is set by `build` for its own script and left `undefined` for every other
// one, which is how the passes below tell which wiring is standing.
let churnBinding: TChurnBinding | undefined = undefined;
let readBinding: TReadBinding | undefined = undefined;
let relationBinding: TRelationBinding | undefined = undefined;
let singleBinding: TSingleBinding | undefined = undefined;

const build = (): TBinding => {
    if (churnBuild !== undefined) {
        churnBinding = churnBuild(consumers, view, plan);
        return churnBinding;
    }
    if (readBuild !== undefined) {
        readBinding = readBuild(consumers, view, plan);
        return readBinding;
    }
    if (relationBuild !== undefined) {
        relationBinding = relationBuild(consumers, view, plan);
        return relationBinding;
    }
    if (singleBuild !== undefined) {
        singleBinding = singleBuild(consumers, view, plan);
        return singleBinding;
    }
    return scenario.perGroup === true
        ? adapter.bindPerGroup(groupConsumers, view, plan)
        : buildTwoViews();
};

// Cold start BUILDS inside its timed region and teardown DISPOSES, so between a
// run and the next restore there may be no store at all: `dropBinding` must tell
// that from "give this back" without asking an adapter to survive a second
// `dispose`.
let bindingLive = false;
const firstBinding = build();
bindingLive = true;

const ctx: TScenarioContext = {
    binding: firstBinding,
    // The same object seen through the churn and read contracts. Read after
    // `build`, which assigns them.
    churn: churnBinding,
    read: readBinding,
    relation: relationBinding,
    single: singleBinding,
    consumers,
    groupConsumers,
    rows,
    rowById,
    plan,
    view,
    cells,
    owners,
    relationConfig,
    singleConfig,
    loadRows,
    // Two, cycled, so "the same array as last time" is never true — and separate
    // clones from `deletedRows`, or one scenario's writes reach the other's restore.
    resendCopies: [cloneRows(windowRows), cloneRows(windowRows)],
    deletedRows,
    insertRows: cloneRows(plan.fresh),
    floorRows: rows
        .filter(row => row.group === GROUP_A)
        .sort(compareRows)
        .slice(0, WINDOW),
    floorRowsB: rows
        .filter(row => row.group === GROUP_B)
        .sort(compareRows)
        .slice(0, WINDOW),
    newBinding: () => {
        if (bindingLive) {
            throw new Error(
                'newBinding() was called while a store was still standing. Building over a live ' +
                    'binding would put its teardown inside whatever region is being timed; drop it ' +
                    'first, in the untimed restore.'
            );
        }
        ctx.binding = build();
        ctx.churn = churnBinding;
        ctx.read = readBinding;
        ctx.relation = relationBinding;
        ctx.single = singleBinding;
        bindingLive = true;
    },
    dropBinding: () => {
        if (!bindingLive) return;
        bindingLive = false;
        ctx.binding.dispose();
    },
};

const load = (): void => {
    if (storeless) return;
    // A single wiring's row-store half THROWS (`noRowStore`), so this would be a
    // crash rather than a wasted write. Its two values come from `holdSingle`.
    if (singleBinding !== undefined) return;
    // Owners first: nothing resolves against an owner not yet in the store, and
    // `holdRelation` — which `prepare` calls next — resolves every one of them.
    if (relationBinding !== undefined) relationBinding.writeOwners(loadOwners);
    ctx.binding.write(ctx.loadRows);
    ctx.binding.settle();
};

const rebuild = (): void => {
    ctx.dropBinding();
    ctx.newBinding();
};

// No opening load for a script that builds its own store: it disposes whatever
// is here in its restore, so this would be writes into a store thrown away
// before the first sample.
if (!scenario.rebuild && scenario.fromEmpty !== true) load();
scenario.prepare(ctx);

// Whether the consumers continue from the state they last rendered. They must
// NOT when the store is built from empty each sample, or the consumer recognises
// the reloaded rows as "nothing happened".
const forgetBetweenSamples =
    scenario.rebuild || scenario.fromEmpty === true;

const settleForSample = (): void => {
    if (scenario.rebuild) rebuild();
    else scenario.restore(ctx);
    consumers.a.reset(forgetBetweenSamples);
    consumers.b.reset(forgetBetweenSamples);
    // BOTH SETS, ALWAYS, so that no script can inherit a counter or a remembered
    // state from whichever wiring ran before it.
    resetGroupConsumers(groupConsumers, forgetBetweenSamples);
};

// The model is put into the state the script starts from, mirroring what
// `settleForSample` leaves the adapter's consumers in; without it every script
// that changes nothing visible would show one distinct render here and none for
// the adapters.
const replayOracle = (): BenchOracle => {
    const model = new BenchOracle(view, WINDOW * 2, GROUP_NAMES);
    // A single script's model holds no rows, for the reason `load` writes none:
    // loading one would put the model's consumers on a window state the
    // adapter's were never in.
    if (
        !storeless &&
        scenario.single !== true &&
        !scenario.rebuild &&
        scenario.fromEmpty !== true
    ) {
        model.load(ctx.rows);
        // The WIRING decides which consumers the starting state reaches: the
        // fifty must remember what they were showing, and a READ wiring puts
        // both views over group A.
        if (scenario.perGroup === true) model.emitEveryGroup();
        else if (scenario.read !== undefined) model.emitReadViews(0);
        else model.emit();
        model.settled();
    }
    scenario.oracle(ctx, model);
    return model;
};

// One signature per adapter whichever wiring produced it: a per-group run folds
// its fifty digests into the first field and sums its counters into the first
// slot. The counters stay OUT of the digest — the deliveries beyond one per
// consumer are the whole measurement.
const perGroup = scenario.perGroup === true;
const emptySlot = { deliveries: 0, distinct: 0, redundant: 0 };

// Written once and used by BOTH passes: a second copy of the fold that forgot
// the render counts would let a store that skipped work pass in one pass and
// fail in the other.
const adapterAnswer = (): string =>
    scenario.finalStateOnly === true
        ? finalStateSignatureOf(
              consumers.a.stateDigest(),
              consumers.b.stateDigest(),
              consumers.a.rowCount(),
              consumers.b.rowCount()
          )
        : signatureOf(
              perGroup ? foldGroupDigests(groupConsumers) : consumers.a.digest,
              perGroup ? 0 : consumers.b.digest,
              perGroup
                  ? totalGroupCounters(groupConsumers).distinct
                  : consumers.a.distinct,
              perGroup ? 0 : consumers.b.distinct
          );

const oracleAnswer = (model: BenchOracle): string =>
    scenario.finalStateOnly === true
        ? finalStateSignatureOf(
              model.a.stateDigest(),
              model.b.stateDigest(),
              model.a.rowCount(),
              model.b.rowCount()
          )
        : signatureOf(
              perGroup ? foldGroupDigests(model.groups) : model.a.digest,
              perGroup ? 0 : model.b.digest,
              perGroup ? totalGroupCounters(model.groups).distinct : model.a.distinct,
              perGroup ? 0 : model.b.distinct
          );

// All five audits skipped for a storeless bound (no store) and for the teardown
// (no population). A binding that declines an audit is skipped, not failed.
const auditStore = (model: BenchOracle): string | undefined => {
    if (storeless || scenario.populationDestroyed === true) return undefined;
    // Returns rather than falling through: every method the five audits below
    // call THROWS on a single wiring (`noRowStore`), and its two values are the
    // whole of what that family stores.
    if (singleBinding !== undefined) {
        const value = firstSingleMismatch(singleBinding, model, singleConfig);
        return value === undefined ? undefined : `single-value audit: ${value}`;
    }
    const held = firstPopulationMismatch(ctx.binding.readAll(), model.population());
    if (held !== undefined) return `population audit: ${held}`;
    const grouped = firstGroupingMismatch(ctx.binding, model, GROUP_NAMES);
    if (grouped !== undefined) return `grouping audit: ${grouped}`;
    const shaped = firstDeliveredShapeMismatch(
        ctx.binding,
        perGroup
            ? groupConsumers.views.map(bound => bound.consumer)
            : [consumers.a, consumers.b]
    );
    if (shaped !== undefined) return `delivered-shape audit: ${shaped}`;
    if (relationBinding !== undefined) {
        const owned = firstOwnerMismatch(
            relationBinding.readOwners(),
            model.ownerPopulation()
        );
        if (owned !== undefined) return `owner audit: ${owned}`;
        const paired = firstPairMismatch(
            relationBinding.readPairs(),
            model.pairPopulation()
        );
        if (paired !== undefined) return `composite-key audit: ${paired}`;
    }
    return undefined;
};

const secondRunFailure = (): string | undefined => {
    if (!scenario.repeatable || scenario.rebuild || scenario.rendersNothing === true) return undefined;
    consumers.a.reset(forgetBetweenSamples);
    consumers.b.reset(forgetBetweenSamples);
    resetGroupConsumers(groupConsumers, forgetBetweenSamples);
    scenario.run(ctx);
    const again = scenario.check(ctx);
    return again === undefined
        ? undefined
        : `declared repeatable, but a second run without a restore fails its own check — the timing loop ` +
              `would fold no-op runs into every sample: ${again}`;
};

if (mode === 'verify') {
    setChurnReadsAudited(scenario.auditChurnReads === true);
    settleForSample();
    scenario.run(ctx);
    const rendered = scenario.check(ctx);
    const oracle = rendered === undefined ? replayOracle() : undefined;
    // `check` and the digest comparison both ask only what REACHED THE CONSUMER,
    // and several scripts write something no view renders — see `auditStore`.
    const held =
        rendered === undefined && oracle !== undefined
            ? auditStore(oracle)
            : undefined;
    const failure = rendered ?? held;
    // Sent ONLY when the scenario set `finalStateOnly`, so the runner cannot fall
    // back to a weaker comparison for one that never asked. Row counts travel
    // with the digests: a 32-bit fold can collide, a length cannot.
    const finalState =
        scenario.finalStateOnly === true && oracle !== undefined
            ? {
                  stateA: consumers.a.stateDigest(),
                  stateB: consumers.b.stateDigest(),
                  oracleStateA: oracle.a.stateDigest(),
                  oracleStateB: oracle.b.stateDigest(),
                  oracleRowsA: oracle.a.rowCount(),
                  oracleRowsB: oracle.b.rowCount(),
              }
            : {};
    const verdict =
        failure === undefined && oracle !== undefined
            ? {
                  status: 'ok',
                  // The runner cannot compute this: its own `dataset.ts` holds
                  // whichever window IT was started with, not the one this
                  // worker was spawned at.
                  steps: scenario.steps,
                  digestA: perGroup
                      ? foldGroupDigests(groupConsumers)
                      : consumers.a.digest,
                  digestB: perGroup ? 0 : consumers.b.digest,
                  oracleA: perGroup
                      ? foldGroupDigests(oracle.groups)
                      : oracle.a.digest,
                  oracleB: perGroup ? 0 : oracle.b.digest,
                  oracleDistinctA: perGroup
                      ? totalGroupCounters(oracle.groups).distinct
                      : oracle.a.distinct,
                  oracleDistinctB: perGroup ? 0 : oracle.b.distinct,
                  ...finalState,
                  gcAvailable,
                  a: perGroup
                      ? {
                            ...totalGroupCounters(groupConsumers),
                            // The first group's consumer only: fifty heads would
                            // be a wall of text under the verification.
                            rows: groupConsumers.views[0].consumer.rowCount(),
                            head: groupConsumers.views[0].consumer.head(),
                        }
                      : {
                            deliveries: consumers.a.deliveries,
                            distinct: consumers.a.distinct,
                            redundant: consumers.a.redundant,
                            rows: consumers.a.rowCount(),
                            head: consumers.a.head(),
                        },
                  b: perGroup
                      ? { ...emptySlot, rows: 0, head: '(no second view)' }
                      : {
                            deliveries: consumers.b.deliveries,
                            distinct: consumers.b.distinct,
                            redundant: consumers.b.redundant,
                            rows: consumers.b.rowCount(),
                            head: consumers.b.head(),
                        },
              }
            : { status: 'failed', reason: failure };
    const rerunFailure = verdict.status === 'ok' ? secondRunFailure() : undefined;
    emit(rerunFailure === undefined ? verdict : { status: 'failed', reason: rerunFailure });
    process.exit(0);
}

// ── what one run of this script costs, for THIS adapter ─────────────────────

// Bounded by wall clock as well as by count. Both phases run at least once, so a
// run costing more than the whole budget is still warmed once and measured once.
const PROBE_WARMUP_MS = 120;
const PROBE_BUDGET_MS = 200;
const PROBE_MAX_ITERATIONS = 400;

if (mode === 'probe') {
    const warmupStarted = process.hrtime.bigint();
    let warmed = 0;
    do {
        settleForSample();
        scenario.run(ctx);
        warmed++;
    } while (
        warmed < PROBE_MAX_ITERATIONS &&
        Number(process.hrtime.bigint() - warmupStarted) / 1e6 < PROBE_WARMUP_MS
    );

    // The MINIMUM of the RUN ALONE: timing the untimed setup with it overstates
    // a cheap run by whatever its restore costs, and this number is a candidate
    // for the whole scenario's plan.
    const measureStarted = process.hrtime.bigint();
    let runs = 0;
    let runMs = Infinity;
    do {
        settleForSample();
        const started = process.hrtime.bigint();
        scenario.run(ctx);
        const took = Number(process.hrtime.bigint() - started) / 1e6;
        if (took < runMs) runMs = took;
        runs++;
    } while (
        runs < PROBE_MAX_ITERATIONS &&
        Number(process.hrtime.bigint() - measureStarted) / 1e6 < PROBE_BUDGET_MS
    );

    emit({ status: 'probed', runMs, runs, gcAvailable });
    process.exit(0);
}

// ── timing ──────────────────────────────────────────────────────────────────

const repeat = Number(repeatArg);
const samples = Number(samplesArg);
const warmup = Number(warmupArg);
if (
    !Number.isInteger(repeat) || repeat < 1 ||
    !Number.isInteger(samples) || samples < 1 ||
    !Number.isInteger(warmup) || warmup < 1
) {
    emit({
        status: 'failed',
        reason:
            'the timing mode takes its repeat and sample counts from the runner, and got ' +
            `"${repeatArg}" / "${samplesArg}". They are chosen once per scenario so that every ` +
            'adapter in a column is measured with the same estimator.',
    });
    process.exit(0);
}

// Warmed by ITERATION COUNT, not by wall clock: V8 tiers up on counts, so every
// adapter on this scenario must enter the clock having run the same number of
// times.
const timing = time(() => scenario.run(ctx), {
    setup: settleForSample,
    collect,
    warmup,
    samples,
    repeat,
});

// NOTHING HERE MAY ENTER THE TIMED REGION: it runs once per PROCESS, after
// `time` has returned, on a pass starting from the same restored state every
// sample started from. A failure means this process's number describes work that
// was not the work the script describes.
setChurnReadsAudited(scenario.auditChurnReads === true);
settleForSample();
scenario.run(ctx);
const proveThisPass = (): string | undefined => {
    const rendered = scenario.check(ctx);
    if (rendered !== undefined) return rendered;
    const model = replayOracle();
    const mine = adapterAnswer();
    const theirs = oracleAnswer(model);
    if (mine !== theirs) {
        return (
            'the TIMED process disagreed with the reference model on its own clean pass: produced ' +
            `${mine}, the model produced ${theirs}. The verify pass and this one ran the same script ` +
            'in different processes, and this is the process the number above came from.'
        );
    }
    return auditStore(model);
};
const failure = proveThisPass();

emit(
    failure === undefined
        ? {
              status: 'ok',
              ...timing,
              gcAvailable,
              // The same two slots the verify pass fills, filled the same way.
              a: perGroup
                  ? totalGroupCounters(groupConsumers)
                  : {
                        deliveries: consumers.a.deliveries,
                        distinct: consumers.a.distinct,
                        redundant: consumers.a.redundant,
                    },
              b: perGroup
                  ? emptySlot
                  : {
                        deliveries: consumers.b.deliveries,
                        distinct: consumers.b.distinct,
                        redundant: consumers.b.redundant,
                    },
          }
        : { status: 'failed', reason: failure }
);
