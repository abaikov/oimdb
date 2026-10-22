/**
 * THE CONSUMER. One class, shared by every adapter, and the only thing in this
 * benchmark that is allowed to be the end of a measurement.
 *
 * A benchmark with NO consumer measures which library is best at NOT DOING THE
 * WORK: most of these libraries do nothing until something downstream asks. So
 * every scenario ends here, and three properties are enforced:
 *
 * 1. THE SAME CODE FOR EVERY ADAPTER. An adapter supplies only the plumbing that
 *    calls `begin/row/end`. `row` takes PRIMITIVES, not an object, so no adapter
 *    can hand over a fat row and let the consumer do less work, and none can hand
 *    over a lazy proxy and let it do more.
 *
 * 2. A DIGEST THE HARNESS CHECKS — the sequence of DISTINCT rendered states, in
 *    order. An adapter that coalesced two states into one render, skipped a change,
 *    or produced different rows arrives at a different number, and the harness
 *    refuses to print a ranking for that scenario at all.
 *
 * 3. FORCED, NOT MERELY AVAILABLE. Reading a digest once at the end would let a
 *    pull-based store do everything in one final gulp and look fast; the digest
 *    folds PER DELIVERY, so deferring N changes into one render produces a shorter
 *    sequence and fails loudly instead of posting a flattering time.
 *
 * A REDUNDANT delivery — text identical to the previous one — is COUNTED AND NOT
 * FOLDED: waking for nothing belongs in the report, but must not make two adapters
 * that computed the same states disagree about the digest.
 */

import type { TRow } from './dataset';

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export class BenchConsumer {
    /**
     * The formatted rows. Preallocated and overwritten in place: a fresh array per
     * delivery would put an allocation proportional to the window in front of every
     * adapter equally.
     */
    private readonly lines: string[];
    private count = 0;
    /** Deliveries: the plumbing called the consumer. */
    public deliveries = 0;
    /** Deliveries whose text was identical to the one before. Woke for nothing. */
    public redundant = 0;
    /** Deliveries whose text differed. This is the sequence the digest is over. */
    public distinct = 0;
    /** The order-sensitive fold over distinct renders. Compared across adapters. */
    public digest = FNV_OFFSET >>> 0;
    private hash = FNV_OFFSET;
    private lastHash = 0;
    private open = false;
    /**
     * THE ARRAY THE LAST WINDOW DELIVERY WAS HANDED — a reference, never read
     * during a delivery, and the only witness the harness has of the SHAPE an
     * adapter renders from.
     *
     * `deliver` in `render.ts` is the sole writer, through `begin`. It is what
     * `TBinding.deliverableRows` is checked against in the verify pass
     * (`firstDeliveredShapeMismatch` in `floor.ts`), so an adapter answering with
     * a second derivation cannot supply a floor for a shape nothing renders.
     *
     * IT DOES NOT LET THE CONSUMER DO LESS WORK: it is never read between `begin`
     * and `end`, and no adapter can reach it.
     *
     * `undefined` AFTER A DELIVERY THAT PASSED NO ARRAY — a cell, relation, churn
     * or page delivery clears it rather than leaving the last window's array
     * standing, so the audit can tell "no window view was driven" from "the window
     * view was driven and this is what it was driven with".
     */
    private delivered: readonly TRow[] | undefined = undefined;

    constructor(public readonly name: string, capacity: number) {
        this.lines = new Array<string>(capacity).fill('');
    }

    /**
     * `rows` is the array this delivery is rendering FROM, where there is one —
     * see {@link delivered}. Every other delivery helper passes nothing, which
     * clears the witness.
     */
    public begin(rows?: readonly TRow[]): void {
        if (this.open) {
            throw new Error(
                `consumer ${this.name}: begin() inside a delivery. The plumbing must close one ` +
                    'render before starting the next, or the rows of two states are folded as one.'
            );
        }
        this.open = true;
        this.count = 0;
        this.hash = FNV_OFFSET;
        this.delivered = rows;
    }

    /** The witness — see {@link delivered}. Untimed; read only by the audit. */
    public deliveredRows(): readonly TRow[] | undefined {
        return this.delivered;
    }

    /**
     * One visible row, in view order. Primitives only.
     *
     * The line is BUILT rather than only hashed: "the consumer produced text you
     * can read" is what makes a reaction visible, and one formatted line per row is
     * the cheapest thing still shaped like the work a UI does. `consumerFloor`
     * measures what it costs.
     */
    public row(id: string, rank: number, label: string): void {
        const line = `${id} ${rank} ${label}`;
        this.lines[this.count++] = line;
        let h = this.hash;
        for (let i = 0; i < line.length; i++) {
            h ^= line.charCodeAt(i);
            h = Math.imul(h, FNV_PRIME);
        }
        this.hash = h;
    }

    public end(): void {
        if (!this.open) {
            throw new Error(`consumer ${this.name}: end() without begin().`);
        }
        this.open = false;
        // The row count is folded in as well, so a view that lost its last row
        // is not the same state as one that never had it.
        let h = this.hash ^ this.count;
        h = Math.imul(h, FNV_PRIME);
        this.deliveries++;
        if (h === this.lastHash) {
            this.redundant++;
            return;
        }
        this.lastHash = h;
        this.distinct++;
        // Order-sensitive: an adapter that produced the same states in a different
        // order, or fewer of them, does not arrive at the same digest.
        let d = this.digest;
        d ^= h & 0xff;
        d = Math.imul(d, FNV_PRIME);
        d ^= (h >>> 8) & 0xff;
        d = Math.imul(d, FNV_PRIME);
        d ^= (h >>> 16) & 0xff;
        d = Math.imul(d, FNV_PRIME);
        d ^= (h >>> 24) & 0xff;
        d = Math.imul(d, FNV_PRIME);
        this.digest = d >>> 0;
    }

    /**
     * Counters and digest back to their start.
     *
     * THE LAST RENDERED STATE IS KEPT unless `forget` says otherwise, which is
     * what makes "re-send an unchanged list" answerable: the scenario asserts
     * nothing distinct was produced, which needs the consumer to remember what it
     * last showed.
     *
     * `forget` is for the one case where remembering is wrong — the store was torn
     * down and rebuilt from empty. Without it the second sample of the load
     * scenario would render the same rows, recognise them, and report that nothing
     * had happened.
     */
    public reset(forget: boolean): void {
        if (this.open) throw new Error(`consumer ${this.name}: reset() inside a delivery.`);
        this.deliveries = 0;
        this.redundant = 0;
        this.distinct = 0;
        this.digest = FNV_OFFSET >>> 0;
        if (forget) {
            this.lastHash = 0;
            this.count = 0;
        }
    }

    public rowCount(): number {
        return this.count;
    }

    /**
     * THE FOLD OVER THE STATE THIS CONSUMER IS LEFT SHOWING — one state, not the
     * sequence of them.
     *
     * `digest` answers "which states, in which order"; this answers "which state is
     * on screen now". Only the second can be asked of a script whose subject is HOW
     * MANY states a store produced for one frame's writes, where the sequence is
     * the measurement and the ending state the correctness criterion — see
     * `finalStateOnly` on `TScenario`, the only thing that turns this on.
     *
     * NOT A SECOND INSTRUMENT: it is the value `end()` already computed for the
     * state it last accepted, so an adapter's consumer and the reference model's
     * compute it with identical code.
     *
     * A REDUNDANT delivery does not move it, and must not. Zero before anything has
     * been rendered and zero again after `reset(true)`: a consumer told to forget is
     * not showing a state it is continuing from.
     */
    public stateDigest(): number {
        return this.lastHash >>> 0;
    }

    /** The text the consumer last produced — the visible evidence that it reacted. */
    public text(): string {
        let out = '';
        for (let i = 0; i < this.count; i++) out += `${this.lines[i]}\n`;
        return out;
    }

    public head(): string {
        return this.count === 0 ? '(empty)' : this.lines[0];
    }
}

export type TConsumers = {
    /** Over view A: the rows of one group, sorted by rank, windowed. */
    a: BenchConsumer;
    /**
     * Over view B: the same shape over a DIFFERENT group. It exists so that a
     * write to a group-A row has somewhere to be wrongly delivered, and the
     * harness records when it is.
     */
    b: BenchConsumer;
};

export const makeConsumers = (capacity: number): TConsumers => ({
    a: new BenchConsumer('A', capacity),
    b: new BenchConsumer('B', capacity),
});

/**
 * ONE VIEW A BINDING HAS TO SERVE: the group it selects, and the consumer it
 * renders into.
 *
 * Passing a PAIR rather than letting an adapter reach into a consumer set is what
 * lets ONE body inside each adapter serve both the two-view and the fifty-view
 * wiring. The per-group row rests on that: a row where the two wirings ran
 * different code would compare wirings and print the answer as a library.
 */
export type TViewBinding = {
    group: string;
    consumer: BenchConsumer;
};

/**
 * A CONSUMER PER GROUP — fifty of them, and their SEPARATENESS is the
 * measurement.
 *
 * A SECOND SET BESIDE `TConsumers`, NOT A WIDER `TConsumers`. `a` and `b` have
 * ROLES — `a` is the view a script writes to, `b` the view that must stay silent —
 * and thirteen scripts are written, checked and read in those terms. An adapter is
 * told which set it is being asked for by WHICH METHOD IS CALLED.
 *
 * FIFTY CONSUMERS AND NOT ONE OVER FIFTY GROUPS. `BenchConsumer` folds one hash per
 * begin/end pair, so a store that woke once and one that woke fifty times produce
 * the IDENTICAL digest and counts. The quantity this row reports — how many of the
 * other forty-nine were woken by a write concerning one — does not exist until each
 * group is counted on its own.
 */
export type TGroupConsumers = {
    /**
     * One per group, in group order. Handed to an adapter exactly as it is, so
     * the adapter never has to know how a group is named or how many there are.
     */
    readonly views: readonly TViewBinding[];
};

export const makeGroupConsumers = (
    groups: readonly string[],
    capacity: number
): TGroupConsumers => ({
    views: groups.map(group => ({
        group,
        consumer: new BenchConsumer(group, capacity),
    })),
});

export const resetGroupConsumers = (
    consumers: TGroupConsumers,
    forget: boolean
): void => {
    for (const view of consumers.views) view.consumer.reset(forget);
};

/**
 * THE FIFTY SEQUENCE DIGESTS AS ONE NUMBER, in group order.
 *
 * The runner compares one signature per adapter against one from the reference
 * model, with the same two fields whichever wiring produced them. Order-sensitive,
 * count mixed in, as `end()` folds a state.
 *
 * IT MAY ONLY EVER FOLD DIGESTS, NEVER DELIVERY COUNTS: waking for nothing stays
 * outside the digest and is reported as a count, or an adapter that woke forty-nine
 * bystanders would read as one that computed different states — the whole subject
 * of the row this fold serves.
 */
export const foldGroupDigests = (consumers: TGroupConsumers): number => {
    let folded = FNV_OFFSET >>> 0;
    for (const view of consumers.views) {
        const digest = view.consumer.digest;
        folded ^= digest & 0xff;
        folded = Math.imul(folded, FNV_PRIME);
        folded ^= (digest >>> 8) & 0xff;
        folded = Math.imul(folded, FNV_PRIME);
        folded ^= (digest >>> 16) & 0xff;
        folded = Math.imul(folded, FNV_PRIME);
        folded ^= (digest >>> 24) & 0xff;
        folded = Math.imul(folded, FNV_PRIME);
    }
    folded ^= consumers.views.length;
    return Math.imul(folded, FNV_PRIME) >>> 0;
};

/** Deliveries, distinct renders and wake-ups-for-nothing, summed over the fifty. */
export type TCounterTotals = {
    deliveries: number;
    distinct: number;
    redundant: number;
};

/**
 * THE SUM ACROSS THE FIFTY, which is where the answer is.
 *
 * `distinct` must come out at the script's step count — one consumer, once per
 * step — and `redundant` is then every wake-up that produced no new text, which
 * for a script that changes one group per step IS the count of bystanders woken.
 * Perfect selectivity is `deliveries === distinct`; a store with one global
 * change signal posts `steps × groups`.
 */
export const totalGroupCounters = (
    consumers: TGroupConsumers
): TCounterTotals => {
    const totals: TCounterTotals = { deliveries: 0, distinct: 0, redundant: 0 };
    for (const view of consumers.views) {
        totals.deliveries += view.consumer.deliveries;
        totals.distinct += view.consumer.distinct;
        totals.redundant += view.consumer.redundant;
    }
    return totals;
};
