/**
 * Measurement primitives.
 *
 * Timing is a median of repeated runs after a warm-up, never a single `performance.now()` pair: the
 * first runs of anything on V8 measure the JIT, not the code. Memory is RETAINED heap — collected
 * before and after, with the structure still referenced — not an allocation delta, which mostly
 * measures garbage and is what makes naive memory columns meaningless.
 */

const gc = (): void => {
    const g = globalThis as unknown as { gc?: () => void };
    if (typeof g.gc !== 'function') {
        throw new Error(
            'Run with --expose-gc: without a forced collection, retained memory cannot be measured.'
        );
    }
    // Twice: the first pass can resurrect nothing but does free what the second then compacts.
    g.gc();
    g.gc();
};

export type TTiming = {
    /** Median run, in milliseconds. */
    median: number;
    /** Fastest run — the floor the machine is capable of for this work. */
    best: number;
    /** Spread as a fraction of the median; a large value means the number is not trustworthy. */
    spread: number;
    runs: number;
};

/**
 * Repeat counts scaled to how expensive one run is. Nine repeats of a 60-second scenario buys no
 * extra confidence worth ten minutes of wall clock, while a 10-microsecond scenario needs every one
 * of them to rise above timer noise. `sampleMs` is the cost of a single run, measured by the caller.
 */
const plan = (sampleMs: number): { warmup: number; runs: number } => {
    if (sampleMs < 50) return { warmup: 3, runs: 9 };
    if (sampleMs < 500) return { warmup: 2, runs: 7 };
    if (sampleMs < 5_000) return { warmup: 1, runs: 5 };
    // Never two: a median of two samples is not a median, and the slowest scenarios are exactly
    // where the spread is widest and a robust middle matters most.
    return { warmup: 0, runs: 3 };
};

export const time = (
    run: () => void,
    opts: {
        warmup?: number;
        runs?: number;
        setup?: () => void;
        sampleMs?: number;
    } = {}
): TTiming => {
    const scaled = plan(opts.sampleMs ?? 0);
    const warmup = opts.warmup ?? scaled.warmup;
    const runs = opts.runs ?? scaled.runs;

    for (let i = 0; i < warmup; i++) {
        opts.setup?.();
        run();
    }

    const samples: number[] = [];
    for (let i = 0; i < runs; i++) {
        opts.setup?.();
        const started = process.hrtime.bigint();
        run();
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    }

    samples.sort((a, b) => a - b);
    // A true median: with an even count take the mean of the two middle samples. Reading
    // `samples[n >> 1]` returns the UPPER middle, which for two samples is simply the worse of the
    // pair — and that was being reported as "median" on the slowest rows, where it inflated the
    // figure by more than 2x against the same run's best.
    const middle = samples.length >> 1;
    const median =
        samples.length % 2 === 1
            ? samples[middle]
            : (samples[middle - 1] + samples[middle]) / 2;
    const best = samples[0];
    const worst = samples[samples.length - 1];
    return {
        median,
        best,
        spread: median === 0 ? 0 : (worst - best) / median,
        runs,
    };
};

/**
 * Retained heap of whatever `build` returns, in bytes.
 *
 * The result is held across the second collection on purpose — that is what makes the number
 * "memory this structure costs to keep", rather than "memory this code touched".
 */
export const retained = <T>(build: () => T): number => {
    gc();
    const before = process.memoryUsage().heapUsed;
    const held = build();
    gc();
    const after = process.memoryUsage().heapUsed;
    // Touch it so nothing above can be optimised away or collected early.
    if ((held as unknown) === Symbol.for('never')) throw new Error('unreachable');
    return after - before;
};

export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

export const formatMs = (ms: number): string => {
    // Sub-microsecond values are real — a keyed write costs a couple of hundred nanoseconds — and
    // printing them as "0 µs" throws the measurement away at the very last step.
    if (ms < 0.001) return `${(ms * 1e6).toFixed(0)} ns`;
    if (ms < 1) return `${(ms * 1000).toFixed(1)} µs`;
    return `${ms.toFixed(2)} ms`;
};
