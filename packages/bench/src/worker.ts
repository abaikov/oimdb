/**
 * One adapter, one scenario, one process.
 *
 * Isolation is not tidiness here, it is correctness. Running every scenario in a single process was
 * producing wrong numbers in two distinct ways: libraries with global reactivity state leaked
 * between scenarios (Legend-State stops re-running newly registered `observe` callbacks once an
 * earlier batch of them is live, so its effect row silently measured nothing), and heap
 * measurements included whatever the previous adapter had left behind. A fresh process per scenario
 * removes both, and flattens the JIT/GC differences that made repeated runs disagree by 2×.
 *
 * Prints a single JSON line on stdout; the parent parses it.
 */
import { retained, time } from './harness/measure';
import {
    adapterByName,
    DEFAULT_REPEAT_CAP,
    SCENARIOS,
} from './harness/registry';
import { makeComments, makeUsers } from './harness/types';
import type { TAdapter, TScenarioImpl } from './harness/types';

const [adapterName, scenarioKey, sizeArg] = process.argv.slice(2);
const N = Number(sizeArg);

const adapter = adapterByName(adapterName);
const scenario = SCENARIOS.find(s => s.key === scenarioKey);
if (!scenario) throw new Error(`Unknown scenario: ${scenarioKey}`);

const users = makeUsers(N);
const comments = makeComments(Math.min(N, 1_000), 5);

const READS = 100_000;
const QUERIES = 1_000;
const CHAIN_UPDATES = 10_000;
const CHURN_ROWS = 100;
const DERIVED = 1_000;
const INTERACTIONS = 20;
const CARD_UPDATES = 100;
const SEARCHES = 50;
const INSERTS = 1_000;
const REWRITES = 10;

/**
 * What the scenario MUST answer, derived from the dataset rather than from any library. Each query
 * loop ends on a known key, so the last answer is predictable: if an adapter filters differently,
 * caches something stale, or silently returns a shorter list, the number disagrees and the row is
 * reported as failed instead of as a fast time.
 */
const expectedResult = (): number | undefined => {
    const lastTeam = `t${(QUERIES - 1) % 50}`;
    switch (scenario.key) {
        case 'queryColdByField':
        case 'queryHotByField':
        case 'queryCachedByField':
        case 'queryHotKeysOnly':
            return users.filter(u => u.teamId === lastTeam).length;
        case 'facetedFilter': {
            const active = Math.floor((QUERIES - 1) / 50) % 2 === 0;
            return users.filter(u => u.teamId === lastTeam && u.active === active)
                .length;
        }
        case 'relatedLookup': {
            const lastUser = `u${(QUERIES - 1) % users.length}`;
            return comments.filter(c => c.userId === lastUser).length;
        }
        case 'taskTable':
            return 20; // a page is a page
        case 'taskFacetSearch': {
            // The loop ends on i = SEARCHES-1 → team `t${i % 10}`, active = i % 2 === 0.
            const i = SEARCHES - 1;
            return users.filter(
                u =>
                    u.teamId === `t${i % 10}` &&
                    u.active === (Math.floor(i / 10) % 2 === 0)
            ).length;
        }
        case 'orderedInsert':
            return users.filter(u => u.teamId === 't0').length + INSERTS;
        default:
            return undefined;
    }
};

const emit = (result: unknown): void => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
};

const make = (): TScenarioImpl | undefined => {
    switch (scenario.key) {
        case 'taskTable':
            return adapter.taskTable?.(users, INTERACTIONS);
        case 'taskFeedPush':
            return adapter.taskFeedPush?.(users);
        case 'taskDetailCard':
            return adapter.taskDetailCard?.(users, comments, CARD_UPDATES);
        case 'taskFacetSearch':
            return adapter.taskFacetSearch?.(users, SEARCHES);
        case 'load':
            return adapter.load?.(users);
        case 'readByPk':
            return adapter.readByPk?.(users, READS);
        case 'queryColdByField':
            return adapter.queryColdByField?.(users, QUERIES);
        case 'queryHotByField':
            return adapter.queryHotByField?.(users, QUERIES);
        case 'queryCachedByField':
            return adapter.queryCachedByField?.(users, QUERIES);
        case 'queryHotKeysOnly':
            return adapter.queryHotKeysOnly?.(users, QUERIES);
        case 'facetedFilter':
            return adapter.facetedFilter?.(users, QUERIES);
        case 'relatedLookup':
            return adapter.relatedLookup?.(users, comments, QUERIES);
        case 'computedChain':
            return adapter.computedChain?.(users, CHAIN_UPDATES);
        case 'orderedInsert':
            return adapter.orderedInsert?.(users, INSERTS);
        case 'subscriptionChurn':
            return adapter.subscriptionChurn?.(users, CHURN_ROWS);
        case 'pointUpdate':
            return adapter.pointUpdate?.(users);
        case 'effectDispatch':
            return adapter.effectDispatch?.(users);
        case 'batchUpdate':
            return adapter.batchUpdate?.(users);
        case 'fanOutRecompute':
            return adapter.fanOutRecompute?.(users, DERIVED, 1);
        case 'diamondGlitch':
            return adapter.diamondGlitch?.(users, 1);
        case 'deepGraphGlitch':
            return adapter.deepGraphGlitch?.(users, 8, 1);
        case 'unrelatedFieldWakeups':
            return adapter.unrelatedFieldWakeups?.(users, 1);
        case 'burstCoalescing':
            return adapter.burstCoalescing?.(users, REWRITES);
        default:
            return undefined;
    }
};

if (scenario.memory) {
    const build = (
        adapter[scenario.key as 'memoryForEntities' | 'memoryForSubscriptions'] as
            | ((u: typeof users) => { build: () => unknown })
            | undefined
    )?.(users);
    emit(
        build
            ? { status: 'ok', bytes: retained(build.build) }
            : { status: 'unsupported' }
    );
} else {
    const impl = make();
    if (!impl) {
        emit({ status: 'unsupported' });
    } else {
        impl.setup();
        impl.run();
        // `sampleMs` decides how many repeats make a 50 ms sample, so it has to be the STEADY-STATE
        // cost. Timing the very first call measures V8's interpreter tier — for a sub-microsecond
        // operation that came out ~100x high, which then divided the repeat count down by the same
        // factor and pinned the sample at a millisecond.
        //
        // The warm-up is therefore bounded by WALL TIME as well as by iterations. A flat 200 runs is
        // right for a 500 ns write and fatal for a 4-second one — SignalDB's keyed read would have
        // spent fourteen minutes warming up against a five-minute timeout, which is exactly how the
        // previous run died. Cheap scenarios still get their hundreds of iterations; expensive ones
        // are already past the interpreter tier after one.
        // Warming and probing must go through `setup()` exactly like the timed loop does. A scenario
        // that INSERTS (load, orderedInsert) rebuilds its store there; calling `run()` repeatedly
        // without it inserts the same ids twice and LokiJS throws "Document is already in
        // collection". The timing loop always paired them — the warm-up did not, which turned three
        // adapters' insert rows into hard errors.
        const cycle = () => {
            impl.setup();
            impl.run();
        };

        const WARMUP_BUDGET_MS = 60;
        const warmStarted = process.hrtime.bigint();
        let warmIterations = 0;
        while (
            warmIterations < 200 &&
            Number(process.hrtime.bigint() - warmStarted) / 1e6 < WARMUP_BUDGET_MS
        ) {
            cycle();
            warmIterations++;
        }

        // Probe the warm cost, again bounded: a handful of cycles for anything slow.
        const probeStarted = process.hrtime.bigint();
        let probeIterations = 0;
        while (
            probeIterations < 20 &&
            Number(process.hrtime.bigint() - probeStarted) / 1e6 < WARMUP_BUDGET_MS
        ) {
            cycle();
            probeIterations++;
        }
        const sampleMs =
            Number(process.hrtime.bigint() - probeStarted) / 1e6 / probeIterations;

        // The counters ("1 of 10,000 woke", "1 recomputed") must describe ONE invocation, so they are
        // read from a clean pass after the warm-up — otherwise they report the total accumulated
        // over every warm-up call and print nonsense like "221 recomputed, 221 woken". Only
        // scenarios that HAVE counters pay for that pass: an extra full run of a 41-second scenario
        // is 41 seconds spent producing a number nobody reads.
        const reportsCounters =
            ('counter' in scenario && scenario.counter) ||
            ('reactive' in scenario && scenario.reactive);
        if (reportsCounters) {
            impl.setup();
            impl.run();
        }
        const expected = expectedResult();
        const actual = impl.result?.();
        if (impl.verify && !impl.verify()) {
            emit({ status: 'failed', reason: 'verify' });
        } else if (
            expected !== undefined &&
            actual !== undefined &&
            actual !== expected
        ) {
            emit({
                status: 'failed',
                reason: `wrong result: got ${actual}, dataset says ${expected}`,
            });
        } else if (process.env.BENCH_VERIFY_ONLY) {
            // Correctness audit: the one clean invocation above is all that is needed, so skip the
            // timing loop entirely. Auditing every adapter with full timing takes hours.
            emit({ status: 'ok', result: actual, expected });
        } else {
            // The counter is read from the single verification run above, before the timed repeats,
            // so it reflects one clean invocation rather than an accumulated total.
            const counted = impl as TScenarioImpl & {
                woken?: () => number;
                ran?: () => number;
            };
            // Reactive scenarios report both counters; they are what makes the time explainable.
            const reactive =
                'reactive' in scenario && scenario.reactive
                    ? (() => {
                          const r = impl as unknown as {
                              recomputes: () => number;
                              wakeups: () => number;
                          };
                          return {
                              recomputes: r.recomputes(),
                              wakeups: r.wakeups(),
                              inconsistencies: (
                                  r as unknown as {
                                      inconsistencies?: () => number;
                                  }
                              ).inconsistencies?.(),
                          };
                      })()
                    : undefined;
            const counter =
                scenario.counter === 'woken'
                    ? counted.woken?.()
                    : scenario.counter === 'ran'
                      ? counted.ran?.()
                      : undefined;
            // Sub-microsecond scenarios are repeated inside one sample, then divided back down;
            // timing a single write would measure the timer, not the write.
            //
            // The count is DERIVED from what one operation actually cost, never fixed: a constant
            // 10,000 is right for a 200 ns write and catastrophic for a 376 ms one — SignalDB's
            // point update with 10,000 live cursors would have made a single sample take over an
            // hour, which is exactly how this benchmark hung. Target ~50 ms of work per sample.
            const maxRepeat =
                'repeat' in scenario ? scenario.repeat : DEFAULT_REPEAT_CAP;
            // Repeating only ever exists to lift a sub-microsecond operation above timer noise, and
            // it runs `run()` several times per `setup()`. A scenario that INSERTS is not idempotent
            // under that — the second pass re-inserts the same ids and LokiJS throws — so anything
            // already comfortably measurable (≥1 ms, a thousand times the timer's resolution) is
            // measured once per setup, exactly as written.
            const noRepeat = 'noRepeat' in scenario && scenario.noRepeat;
            const repeat =
                noRepeat || maxRepeat === 1 || sampleMs >= 1
                    ? 1
                    : Math.max(
                          1,
                          Math.min(maxRepeat, Math.floor(50 / Math.max(sampleMs, 0.0001)))
                      );
            const once = impl.run;
            const sample =
                repeat === 1
                    ? once
                    : () => {
                          for (let i = 0; i < repeat; i++) once();
                      };
            const t = time(sample, {
                setup: impl.setup,
                sampleMs: sampleMs * repeat,
            });
            emit({
                status: 'ok',
                runs: t.runs,
                repeat,
                reactive,
                median: t.median / repeat,
                best: t.best / repeat,
                spread: t.spread,
                counter,
            });
        }
    }
}

// Keep the reference alive for the type-checker without exporting anything.
export type TWorkerAdapter = TAdapter;
