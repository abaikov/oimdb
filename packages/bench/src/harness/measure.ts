// Timing, on a machine that lies.
//
// THE HEADLINE IS THE MINIMUM, NEVER THE MEAN. Every error on a loaded laptop — a
// preemption, a GC pause, a thermal step, another process — adds time and never
// subtracts it, so the mean measures the neighbours on this machine and the minimum
// measures the code. The sampling plan, the warm-up equality and the pricing of
// `repeat` are in `README.md#measure`.

// The spread above which a sample set says more about the machine than the code.
// Nothing derives the number; see `README.md#measure`.
export const SPREAD_CEILING = 0.3;

export type TTiming = {
    min: number;
    median: number;
    max: number;
    // Across the samples of ONE process. Not comparable with `TMeasuredRecord.drift`.
    spread: number;
    samples: number;
    repeat: number;
    // What this adapter actually reached, which the plan's ceiling can cut short;
    // the runner names every adapter that fell short of `TSamplingPlan.warmup`.
    warmed: number;
};

// The SAME numbers for every adapter on a scenario; the report's percentages depend
// on that equality.
export type TSamplingPlan = {
    repeat: number;
    samples: number;
    warmup: number;
};

const WARMUP_BUDGET_MS = 1000;

const WARMUP_CEILING_MS = 5 * WARMUP_BUDGET_MS;

const WARMUP_FLOOR = 5;
const WARMUP_CEILING = 2000;

export const time = (
    run: () => void,
    options: {
        setup?: () => void;
        // Untimed, and only before TIMED samples: without it a dropped 10 000-row
        // store is collected inside the next timed run, per adapter.
        collect?: () => void;
        warmup: number;
        samples: number;
        repeat: number;
    }
): TTiming => {
    const { setup, collect, warmup, samples, repeat } = options;

    // At least one pass however small the count, or the first TIMED sample is the
    // cold one; the ceiling is therefore tested AFTER an iteration.
    const warmupStarted = process.hrtime.bigint();
    let warmed = 0;
    while (warmed < Math.max(1, warmup)) {
        setup?.();
        for (let r = 0; r < repeat; r++) run();
        warmed++;
        if (
            Number(process.hrtime.bigint() - warmupStarted) / 1e6 >=
            WARMUP_CEILING_MS
        ) {
            break;
        }
    }

    const taken: number[] = [];
    for (let i = 0; i < samples; i++) {
        setup?.();
        collect?.();
        const started = process.hrtime.bigint();
        for (let r = 0; r < repeat; r++) run();
        taken.push(Number(process.hrtime.bigint() - started) / 1e6 / repeat);
    }

    taken.sort((a, b) => a - b);
    const middle = taken.length >> 1;
    const median =
        taken.length % 2 === 1
            ? taken[middle]
            : (taken[middle - 1] + taken[middle]) / 2;
    const min = taken[0];
    const max = taken[taken.length - 1];
    return {
        min,
        median,
        max,
        spread: min === 0 ? 0 : (max - min) / min,
        samples: taken.length,
        repeat,
        warmed,
    };
};

// Folds a run until a sample is worth timing (~20 ms), priced off the MEDIAN
// participant so one straggler cannot set the whole column's resolution.
export const repeatsFor = (sampleMs: number, cap: number): number => {
    if (cap <= 1 || sampleMs >= 20) return 1;
    return Math.max(1, Math.min(cap, Math.floor(20 / Math.max(sampleMs, 0.0005))));
};

// Here rather than in each runner: a median computed two ways in two files would be
// two estimators.
export const medianOf = (values: readonly number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Both callers must hand in figures measured the same way (the probe's minimum of
// one run), or the two halves of the plan are priced in different units.
export const planFor = (
    slowestRunMs: number,
    cap: number,
    medianRunMs: number
): TSamplingPlan => {
    const repeat = repeatsFor(medianRunMs, cap);
    const perSampleMs = slowestRunMs * repeat;
    // One warm-up ITERATION is `repeat` runs, not one.
    const medianIterationMs = medianRunMs * repeat;
    return {
        repeat,
        samples: perSampleMs > 200 ? 5 : perSampleMs > 20 ? 9 : 15,
        warmup: Math.max(
            WARMUP_FLOOR,
            Math.min(
                WARMUP_CEILING,
                Math.floor(WARMUP_BUDGET_MS / Math.max(medianIterationMs, 0.0005))
            )
        ),
    };
};

export const formatMs = (ms: number): string => {
    if (ms < 0.001) return `${(ms * 1e6).toFixed(0)} ns`;
    if (ms < 1) return `${(ms * 1000).toFixed(2)} µs`;
    return `${ms.toFixed(3)} ms`;
};

export const formatPercent = (fraction: number): string =>
    `${(fraction * 100).toFixed(1)}%`;
