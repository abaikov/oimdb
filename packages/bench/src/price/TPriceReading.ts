/**
 * WHAT WAS FOUND OUT ABOUT ONE PAIR — everything the report prints, and
 * everything it would need to explain a number somebody disputes.
 *
 * FOUR TIMINGS, AND BOTH SIDES OF THE RATIO ARE BRACKETED. The floor is timed
 * TWICE inside the pair's process, before and after our side; our side is timed
 * a second time in a PROCESS OF ITS OWN, under the plan the pair's process
 * computed. Each half of the ratio carries a disagreement of identical code with
 * itself — `noise` for the denominator, `oursNoise` for the numerator — and
 * neither is inferred from the other.
 *
 * THE ASYMMETRY IS DELIBERATE. The floor is bracketed in one process because the
 * question there is drift. Our side is bracketed across two because the question
 * there is reproducibility, and a second timing inside the same process would
 * report the small number the floor already reports rather than the one that is
 * there. Measured: `read.rows-vs-set-iteration` and
 * `read.rows-vs-array-iteration` in `2026-08-20-price/read-2` run a copy of
 * one `ours` body over one builder's fixture and came out 5.02% apart, at
 * printed noise of 0.16% and 2.68%.
 *
 * ARTIFACTS RECORDED BEFORE THE OURS BRACKET EXISTED DO NOT CARRY IT. Everything
 * under `measurements/` up to and including `2026-08-21-price` has `noise` and no
 * `oursAgainNs` — so a reader of an old artifact gets `undefined` from either
 * new field and must check for it before quoting it.
 */
export type TPriceReading = {
    readonly id: string;
    readonly path: string;
    readonly ours: string;
    readonly floor: string;
    readonly caveat: string;
    /** Controls attest the instrument; they are not prices and never ranked. */
    readonly isControl: boolean;

    /** Nanoseconds per operation, from the MINIMUM sample. */
    readonly oursNs: number;
    /** The same, from the floor timed BEFORE our side. */
    readonly floorNs: number;
    /** The same, from the floor timed AFTER our side. Identical code. */
    readonly floorAgainNs: number;
    /**
     * The same, from our side timed again IN A SECOND PROCESS, under the plan
     * this pair's own process computed and over the same operation count.
     */
    readonly oursAgainNs: number;
    /** `oursNs / floorNs` — the price tag. */
    readonly ratio: number;
    /**
     * `|floorAgainNs - floorNs| / min(floorNs, floorAgainNs)`, as a fraction.
     * THE DENOMINATOR'S HALF of the row's error. Not the row's error on its own
     * — see `oursNoise` for how a reader combines them.
     */
    readonly noise: number;
    /**
     * `|oursAgainNs - oursNs| / min(oursNs, oursAgainNs)`, as a fraction. THE
     * NUMERATOR'S HALF: our body, the same plan, a second process.
     *
     * HOW A READER COMBINES THE TWO, and it is not the larger of them: the
     * ratio is a quotient, so relative errors ADD — `noise + oursNoise`. Kept
     * apart because which one is large is the whole diagnosis.
     *
     * WHAT IT DOES NOT CATCH. The second process rebuilds the same fixture from
     * the same builder under the same plan, so it cannot see a difference living
     * in the fixture or in the operation count the probe chose. It does see what
     * the recorded corpus shows: the same body, in two processes, disagreeing by
     * up to 10%.
     */
    readonly oursNoise: number;

    /** How many operations one timed pass of each side performed. */
    readonly oursOperations: number;
    readonly floorOperations: number;
    /** `(max - min) / min` within the process. Above ~0.3 the machine was busy. */
    readonly oursSpread: number;
    readonly floorSpread: number;

    /** The sampling plan, identical for both sides by construction. */
    readonly samples: number;
    readonly warmup: number;
    /**
     * Iterations folded into one sample. Pinned to 1 by the cap both callers of
     * `planFor` pass, and recorded anyway: the ours re-check must be handed the
     * plan that was USED, not one reconstructed from a constant in another file.
     */
    readonly repeat: number;
    /** What each side actually completed; below `warmup` means it hit the ceiling. */
    readonly oursWarmed: number;
    readonly floorWarmed: number;

    /**
     * Whether this process got `--expose-gc`. Without it the heap a `reset`
     * dropped is collected INSIDE the next timed pass, by an amount that differs
     * per side — which lands in the ratio as a difference between designs.
     */
    readonly gcAvailable: boolean;
    readonly node: string;
};
