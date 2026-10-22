/**
 * ONE HALF OF A PAIR: either the call `@oimdb/core` offers, or the primitive a
 * person would have written instead of it.
 *
 * THE WHOLE PATH IN ONE TIMED BODY, the single rule this shape exists to
 * enforce. `run` performs the operation `times` over and does nothing else — no
 * per-operation closure, no dispatch, no accumulation of pieces, because summing
 * separately-measured micro-benchmarks overstates a path by their call overhead.
 * `run` is called ONCE PER SAMPLE with a large `times`, never per operation.
 *
 * `times` comes from a probe of this very side, so both halves of a pair spend
 * roughly the same wall clock per sample. Equal SAMPLE lengths are what make
 * warm-up, sample count and estimator uniform across the pair, and why
 * `measure.ts`'s `planFor` takes two participants.
 */
export type TPriceSide = {
    /**
     * Untimed, before every warm-up iteration and every timed sample.
     *
     * Steady-state sides leave this empty — their `run` returns the world to
     * where it started. Sides whose pass CONSUMES state (filling an empty store,
     * emptying a full one) rebuild it here, so the teardown never lands inside
     * the clock.
     */
    readonly reset: () => void;
    /**
     * How many operations ONE timed pass performs, when the fixture decides that
     * and not the prober.
     *
     * A side that inserts a population can insert it exactly once; likewise a
     * side that removes one. For those the count is a fact about the fixture and
     * `run` must be handed that number. Omitting it means the side is steady
     * state and the worker scales it to the target sample length instead.
     */
    readonly operationsPerPass?: number;
    /**
     * Exactly `times` of the operation being priced.
     *
     * Every result must be sunk into `priceSink` or into state the process keeps,
     * or V8 deletes the body and the row reports the cost of an empty loop.
     */
    readonly run: (times: number) => void;
};
