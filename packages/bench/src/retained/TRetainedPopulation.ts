/**
 * WHAT ONE ARM HANDS BACK, and the one rule that makes it measurable.
 *
 * THE RULE: everything the population allocates and keeps must be reachable from
 * `root`, and from nothing else. Not from a module-level array, not from a
 * closure the builder left behind, not from a registry inside the library.
 *
 * The worker measures the population from both directions and reports their
 * disagreement as something the arm allocated outliving its root. An arm that
 * hides state outside `root` turns that check into a false alarm; an arm that
 * obeys the rule turns it into a proof.
 */
export type TRetainedPopulation = {
    /** The only thing that keeps the population alive. Dropped by the worker. */
    readonly root: unknown;
    /**
     * THE DIVISOR THE PAIR'S DELTA IS EXPRESSED PER — a property of the PAIR and
     * not of the arm. Both arms report the same number by construction, and the
     * runner REFUSES a pair whose two arms disagree about it.
     */
    readonly rows: number;
};
