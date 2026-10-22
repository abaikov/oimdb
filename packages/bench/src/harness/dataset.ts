import { scrambledText } from './scrambledText';

/**
 * The one dataset, and the one plan of what will be written to it.
 *
 * Both are derived from `n` alone, with no randomness and no dependence on the
 * order anything ran in: every adapter has to be handed BYTE-IDENTICAL input, or
 * the digest comparison is not a fairness check.
 *
 * EVERY VALUE SET HERE CARRIES A DISTINCT ONE-LETTER PREFIX, so a value found in
 * the wrong column or the wrong store names the script that wrote it: `l` stored
 * labels, `n` stored notes, `p` patched, `q` patched notes, `b` batched, `c`
 * batched notes, `d` dirty, `s` churned, `x` propagated through a chain, `w` owner
 * names, `f`/`i`/`k` inserted rows, `h`/`j`/`u` rows the growth script mints,
 * `m`/`t`/`a` rows the mixed frame mints, `e` the mixed frame's patched labels,
 * `z` pair marks.
 */

/**
 * A row. Five columns, and each one is there for a reason:
 *
 * - `group` — what the two views select on.
 * - `rank`  — what the two views sort on.
 * - `label` — read by the consumer, written by the patch scenario. Neither
 *             indexed nor sorted on, so patching it must reach view A and must
 *             NOT reach view B.
 * - `note`  — read by nothing at all, so that "the entity changed" and
 *             "something the view reads changed" are different questions and a
 *             store that cannot tell them apart has somewhere to show it.
 */
export type TRow = {
    id: string;
    group: string;
    rank: number;
    label: string;
    note: string;
};

export const GROUPS = 50;
/** The group view A watches. */
export const GROUP_A = 'g0';
/** The group view B watches — the one a patch to a group-A row must not disturb. */
export const GROUP_B = 'g1';
/**
 * EVERY GROUP'S NAME. It must be the SAME list `makeRows` deals into, or the
 * fifty-consumer wiring would watch a group that holds nothing.
 */
export const GROUP_NAMES: readonly string[] = Array.from(
    { length: GROUPS },
    (_, i) => `g${i}`
);
/**
 * How many rows of a view the consumer formats — the one number deciding how much
 * of each measurement is the STORE and how much the consumer. `consumerFloor`
 * measures a LOWER BOUND on that cost; read its comment before subtracting.
 *
 * IT IS A PROPERTY OF THE WHOLE RUN, NOT OF A SCENARIO: the window is fixed
 * when a binding is built, and the plan, the consumer's capacity and the consumer
 * lower bound all derive from it. The RUNNER varies it (see `cells/points.ts`); setting
 * `BENCH_WINDOW` or `BENCH_N` by hand replaces the sweep with one point.
 *
 * A WINDOW CAN NEVER EXCEED HALF ITS GROUP: `outsideA` is the second window and
 * the deletion scenario refills from it, so `makePlan` throws for anything wider.
 */
export const WINDOW = Number(process.env.BENCH_WINDOW ?? 32);
if (!Number.isInteger(WINDOW) || WINDOW < 16) {
    throw new Error(`BENCH_WINDOW must be an integer of at least 16; got ${process.env.BENCH_WINDOW}`);
}

/** Rows that move between groups. */
export const MOVER_COUNT = 4;
/** Rows whose sort key moves. */
export const SORTER_COUNT = 4;
/**
 * How many rows the targeted-delivery script PINS — resolved once, before the
 * clock, then addressed by position. FIXED rather than derived from `WINDOW`,
 * unlike every other count here, so the sweep's points agree about how much
 * consumer constant the row carries; and it must not EXCEED `WINDOW`, because the
 * values come from `patchedLabels` / `patchedNotes`.
 */
export const PINNED_COUNT = 8;

/**
 * HOW MANY FRAMES THE SUSTAINED-WRITE SCRIPT RUNS — the script where MOST OF THE
 * POPULATION is dirty in every one of them.
 *
 * MORE THAN ONE, which is what the constant is for: `batchPatch` asks what ONE
 * frame's writes cost and can never ask what the frame AFTER a large frame costs.
 * `OIMDB.ts:28` bounds how large a delivery list is carried between frames
 * (`PENDING_KEEP_AT_MOST`), the lists are swapped rather than allocated, and a huge
 * frame's identity stamps must be retired before the next frame can use them.
 *
 * KEPT LOW on wall clock: the script performs `DIRTY_FRAMES × N / DIRTY_FRACTION`
 * writes, and three libraries here copy something population-sized on EVERY
 * single-field patch.
 */
export const DIRTY_FRAMES = 2;

/**
 * WHAT FRACTION OF THE POPULATION IS DIRTY IN EACH OF THOSE FRAMES — one row in
 * `DIRTY_FRACTION`, so two is half.
 *
 * HALF IS THE FRACTION THE ENGINE'S OWN CATALOGUE LOSES AT:
 * `alt.dirty-list-vs-scan.1k-50pct` in `price/alternativePairsDispatch.ts` prices
 * the frame delivery list against stamp-and-scan with 512 of 1024 dirty and records
 * the scan ahead by about 1.18x. That is an internal control; every script patching
 * one row per frame is the 0.1% end of the same table.
 */
export const DIRTY_FRACTION = 2;

/**
 * HOW MANY FRAMES THE DEEP RE-SORT SCRIPT RUNS, each re-ordering the whole of view
 * A's window. STRICTLY BELOW `WINDOW`: the script rotates the window's ranks by
 * `frame + 1` positions and a shift of `WINDOW` is the identity. More than one so
 * the per-frame constants are measured repeatedly rather than once beside a
 * one-off setup cost; few enough to stay in the same wall-clock band as `sortKeyMove`,
 * which it is read against.
 */
export const RESORT_FRAMES = 8;

/**
 * ─── THE SUBSCRIPTION CHURN CONSTANTS ────────────────────────────────────
 *
 * Every script above measures WRITES and DELIVERY with the subscriptions ALREADY
 * STANDING. These size the family that measures the mount and the unmount.
 *
 * `core/OIMEffect.ts`'s constructor allocates per subscription the expanded roots
 * array, a `Set<TOIMSlot>`, a `Set<OIMComputed>` and one `effects` array per root
 * that had none; `OIMEffect.detach` is an `indexOf` plus a `splice` per subscribed
 * root, so N subscribers sharing one root cost O(N²) element compares to unmount.
 */

/**
 * HOW MANY ROWS THE CHURN SCRIPTS CAN SUBSCRIBE TO. Bounds the WIDE case; every
 * other shape puts its subscribers on `churnRows[0]` (see {@link TPlan.churnRows}).
 */
export const CHURN_ROWS = 64;

/**
 * HOW MANY SUBSCRIBERS THE SHARED-ROOT SCRIPTS MOUNT — the small size. The PAIR
 * with {@link CHURN_SUBSCRIBERS_DEEP} makes the quadratic visible AS a shape: at 8×
 * the subscribers an O(N) unmount costs 8× and an O(N²) one 64×, and a single size
 * cannot tell those apart.
 */
export const CHURN_SUBSCRIBERS = 32;

/** The same shape eight times over, which is where a quadratic separates. */
export const CHURN_SUBSCRIBERS_DEEP = 256;

/** How many sources ONE subscriber reads in the wide case. */
export const CHURN_WIDE = 64;

/**
 * HOW MANY SUBSCRIBERS STAY MOUNTED FOR THE WHOLE RESIDENT SCRIPT, and how many
 * are churned against them — the quadratic asked the way a screen asks it. If
 * mount and unmount are O(1) in what already stands, this row costs the same per
 * pair as `churnShared`; if either is linear, the resident set is what it pays for.
 */
export const CHURN_RESIDENT = 256;
export const CHURN_CHURNED = 32;

/** Roots under one chain, and how many derivations are stacked over them. */
export const CHURN_CHAIN_ROOTS = 8;
export const CHURN_CHAIN_DEPTH = 4;

/**
 * HOW MANY TIMES ONE RUN PERFORMS THE WHOLE CYCLE — mount, frame, unmount, frame.
 * MORE THAN ONE, because a mount/unmount pair is far smaller than the frame either
 * side of it and folding cycles puts the churn above the per-run constants.
 */
export const CHURN_CYCLES = 8;

export const APP_CARDS = 80;
export const APP_DECKS = 10;
export const APP_USERS = 5;
export const APP_ROWS = APP_CARDS + APP_DECKS + APP_USERS;
export const APP_TAGS = 4;
export const APP_SUBSCRIBERS = APP_CARDS * 2 + APP_DECKS * 2;
export const APP_ROUNDS = 20;
export const APP_SETTING_STEPS = 20;

/**
 * ─── THE READ-SIDE CONSTANTS ─────────────────────────────────────────────
 *
 * Every script above this line WRITES, and the only reads in it are the ones a
 * delivery performs, charged to whatever write woke them. The three below size the
 * three TIMED read shapes: by KEY, moving a window's OFFSET, and selecting on TWO
 * axes rather than one.
 */

/**
 * HOW MANY PAGES OF KEYS THE READ-BY-KEY SCRIPT READS, one per step. A page is
 * `WINDOW` keys, so the row is directly readable against `consumer lower bound`,
 * and the pages are DISJOINT, so every step's render is distinct.
 */
export const READ_PAGES = 8;

/**
 * HOW MANY TIMES THE SCROLLING SCRIPT MOVES THE WINDOW — half out to a full
 * window, half back to zero. OUT AND BACK for two reasons: a run must end where it
 * started or the script is not repeatable, and group A holds only two windows, so
 * an offset beyond `WINDOW` returns a SHORT window and the row silently measures a
 * view running out of rows.
 */
export const SCROLL_STEPS = 8;

export const SWITCH_STEPS = 8;

export const DELETE_ONE_STEPS = 8;

/**
 * HOW MANY ROWS ONE BATCH OF GENUINELY NEW KEYS BRINGS — the insert into a
 * POPULATED store, against `batch insert`, which loads into an empty one. Sized so
 * every one of the fifty windows gains rows and both watched views are reached BY
 * CONSTRUCTION, the property `reachInto` arranges for the batch and dirty set.
 */
export const INSERT_COUNT = Math.max(GROUPS * 2, WINDOW * 2);

/**
 * ─── THE POPULATION THAT DOES NOT STOP GROWING ───────────────────────────
 *
 * Every other script here runs at a FIXED population: `insert into a populated
 * store` writes one batch of new keys and the untimed restore takes them out
 * again, so no store is ever asked to accept a batch into a store an earlier batch
 * already grew. A feed, a log and an infinite list all do exactly that, and the
 * structures a store rebuilds per batch — an ordered bucket, a sorted array, an
 * identity per key — cost a function of how much is already there.
 */

/**
 * HOW MANY BATCHES ARRIVE, one per settled frame. MORE THAN ONE is the entire
 * constant: at one batch this row IS `insert into a populated store`. Eight,
 * because the script is `repeatable: false` — the rows are in the store after one
 * pass — so every frame of it is paid once per sample and the untimed restore
 * removes the lot.
 */
export const GROWTH_FRAMES = 8;

/**
 * WHAT FRACTION OF THE STARTING POPULATION EACH BATCH BRINGS — one row in
 * `GROWTH_FRACTION`, so at twenty and eight frames the store ends the run FORTY
 * PER CENT LARGER than it started. Floored at {@link INSERT_COUNT} so that a small
 * run still deals rows into every one of the fifty groups and both watched views
 * are reached by construction rather than by arithmetic accident.
 *
 * IT IS NOT UNBOUNDED AND THE SCENARIO SAYS SO. What a bounded growth can show is
 * whether the EIGHTH batch costs what the FIRST did; what it cannot show is an
 * asymptote.
 */
export const GROWTH_FRACTION = 20;

/**
 * ─── THE SECOND ENTITY TYPE, AND WHAT RELATES IT TO THE FIRST ────────────
 *
 * Every script above runs over ONE entity type. These size the operation a
 * single-type suite structurally cannot contain: A WRITE TO ONE TYPE WAKING A VIEW
 * BUILT OVER ANOTHER.
 */

/**
 * HOW MANY RECORDS THE SECOND TYPE HOLDS — few parents, many children. ONE
 * HUNDRED, EXACTLY, because that makes {@link ownerOf} the last two decimal digits
 * of the key and therefore an EVEN deal of the population over the owners at every
 * `n`. Any other count is a modulo with a remainder, and the sharing the relation
 * rows are built on becomes an accident of arithmetic.
 */
export const OWNERS = 100;

/**
 * HOW MANY ROWS THE TWO RELATION SCRIPTS RENDER — {@link PINNED_COUNT}'s number for
 * its reason: both views count REDUNDANT DELIVERIES, and a delivery costs O(rows)
 * formatted lines whatever the store did.
 */
export const RELATION_ROWS = 8;

/**
 * HOW MANY OWNERS THOSE ROWS POINT AT, so each owner parents exactly TWO of them.
 * THE SHARING IS A CONSTRUCTION, not an average: one write to one owner must move
 * TWO rendered lines, where a one-to-one relationship would measure a rename with
 * no fan-out.
 */
export const RELATION_TOUCHED = 4;

/**
 * HOW MANY STEPS ONE RUN OF EITHER RELATION SCRIPT PERFORMS — the same count for
 * both, because the two rows are read against each other. Same steps, same rendered
 * rows, same consumer; what differs is WHICH type is written and which view wakes.
 */
export const RELATION_STEPS = 8;

/**
 * HOW MANY STEPS ONE RUN OF EITHER SINGLE-VALUE SCRIPT PERFORMS.
 *
 * A FIXED COUNT AND NOT {@link WINDOW}, although the default point makes them
 * equal. Half the scripts here derive their step count from the window because
 * what they do is per visible row; a single value has no window, no group and no
 * rows, so a step count that moved with the operating point would make this row
 * a different script at each point while measuring the same act.
 *
 * IT IS 32 AND NOT 8. A write and a settle over one value is the cheapest
 * operation in this suite, and the sampling plan is derived from the SLOWEST
 * participant of a scenario, so a short run leaves the fast rows with samples
 * whose spread is the clock's rather than the store's — the failure C3 refuses a
 * rank for. Four times the relation family's count is what puts one run above the
 * timer's resolution without making the row a throughput measurement.
 */
export const SINGLE_STEPS = 32;

/**
 * THE NAME OF THE VALUE THE SINGLE SCRIPTS WRITE, and the name of the SECOND value
 * beside it that no step of either script writes.
 *
 * They are ADDRESSES and not content, and what the second one is for is in
 * `TSingleBinding` in `types.ts`.
 */
export const SINGLE_NAME = 'single';
export const SINGLE_BYSTANDER = 'bystander';

/**
 * WHAT THE TWO VALUES REST AT, in that order — the state `holdSingle` puts them
 * in, the state an untimed restore puts them back to, and the state both consumers
 * are showing when a script's first step runs.
 *
 * DISTINCT FROM EVERY MARK EITHER SCRIPT WRITES (`SINGLE_MARKS` in
 * `scenarios.ts`, which are `v…`), so the first step of `write one value` is a
 * change by construction rather than by arithmetic accident, and DISTINCT FROM
 * EACH OTHER, so a store that wrote the first value into the second is a different
 * rendered state and not a shorter one.
 */
export const SINGLE_SEEDS: readonly string[] = ['s', 'sx'];

/**
 * THE SECOND ENTITY TYPE. `name` is the only thing either relation view reads out
 * of the owner store: every column added would be one some store could route by
 * and another could not, which `patch an unread column` already answers for the
 * first type.
 */
export type TOwner = { id: string; name: string };

/**
 * ONE RECORD OF THE COMPOSITE-KEYED COLLECTION, AS PLAIN VALUES — the shape the
 * audit compares, not the shape any store keeps. `owner` and `row` are the two
 * halves of the KEY and `mark` is the value, so a store keying by a pair of
 * identities and one keying by a joined string both answer in these terms.
 */
export type TPairRow = { owner: string; row: string; mark: string };

/**
 * EVERY OWNER'S ID, BUILT ONCE, so {@link ownerOf} is an array index and not a
 * string concatenation per call — a join runs once per rendered line per delivery,
 * and allocating there would charge every participant for the harness's own
 * address arithmetic.
 */
export const OWNER_IDS: readonly string[] = Array.from(
    { length: OWNERS },
    (_, i) => `o${i}`
);

/**
 * THE FOREIGN KEY — which owner a row belongs to, derived from the row's KEY (the
 * last two decimal digits, and {@link OWNERS} is exactly one hundred). DERIVED AND
 * NOT STORED, for `onSecondAxis`'s reason; the relation binding is handed it as an
 * ADDRESS, as it is handed `ids` and `ranks`.
 *
 * WHAT THAT COSTS THE ROW: the relationship is IMMUTABLE. What is measured is a
 * write to a PARENT reaching a view over its children; what is NOT measured is a
 * store re-filing a child because its foreign key changed. Both relation scenarios
 * declare it.
 */
export const ownerOf = (id: string): string =>
    OWNER_IDS[
        (id.charCodeAt(id.length - 2) - 48) * 10 +
            (id.charCodeAt(id.length - 1) - 48)
    ];

/** The second population, in id order. Fixed, derived from nothing but OWNERS. */
export const makeOwners = (): TOwner[] =>
    Array.from({ length: OWNERS }, (_, i) => ({
        id: OWNER_IDS[i],
        name: `w${i}`,
    }));

/**
 * THE SECOND SELECTION AXIS — a fact about the KEY, the one column no script here
 * ever writes. The derivation is the hundreds digit, which runs 0,0,1,1,2,2,…
 * within a group and splits it very nearly in half. DERIVED RATHER THAN A SIXTH
 * COLUMN, because `note`'s whole measurement is that NOTHING selects on it.
 *
 * IT IS IMMUTABLE, and the row has to be read with that. A store may index it once
 * when a key arrives and never maintain it — what an index on an immutable
 * attribute is worth, and what a MUTABLE second axis would not give. The two-axis
 * script moves the OTHER axis, so re-selection is still measured; a store re-filing
 * a row because the second axis changed is NOT, and the scenario says so.
 */
export const onSecondAxis = (id: string): boolean =>
    (id.charCodeAt(id.length - 3) & 1) === 0;

const hash32 = (text: string): number => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

/** Euclid — used only to choose a batch stride that visits every group. */
const gcd = (a: number, b: number): number => {
    let x = a;
    let y = b;
    while (y !== 0) {
        const rest = x % y;
        x = y;
        y = rest;
    }
    return x;
};

/**
 * The order both views keep: by rank, ties broken by id. A TOTAL ORDER IS NOT
 * OPTIONAL — two adapters disagreeing about a tie produce different text for the
 * same data and fail the digest check, reported as "these did different work" when
 * the benchmark never said what the right answer was.
 */
export const compareRows = (a: TRow, b: TRow): number =>
    a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Ranks are deliberately NOT monotonic in insertion order: a store whose natural
 * iteration order is insertion order would otherwise get the sorted view for free.
 * The multiple of 200 leaves the odd offsets free for the sort-key scenario to
 * move a row into a gap no other row can occupy.
 */
const rankFor = (id: string): number => 1000 + 200 * (hash32(id) % 100_000);

export const makeRows = (n: number): TRow[] => {
    const rows: TRow[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const id = scrambledText('r', i);
        const group = `g${i % GROUPS}`;
        const ordinal = (i / GROUPS) | 0;
        // The movers are pinned below every other rank so they stay at the head
        // of WHICHEVER group they are in. Otherwise a group move could land one
        // outside both windows, both consumers would render the same text, and
        // the scenario would measure a change nobody could see.
        const isMover = group === GROUP_A && ordinal < MOVER_COUNT;
        rows[i] = {
            id,
            group,
            rank: isMover ? ordinal + 1 : rankFor(id),
            label: scrambledText('l', i),
            note: scrambledText('n', i),
        };
    }
    return rows;
};

/** One row's sort key, and the two values the sort-key scenario moves it between. */
export type TSorter = { id: string; rest: number; low: number; high: number };

/**
 * ONE GROUP'S SHARE OF THE PER-GROUP SCRIPT: the group, and the one row inside its
 * own window whose rank that script moves. BOTH TARGET RANKS SIT INSIDE THIS
 * GROUP'S WINDOW, so a step reorders that window, changes nothing about its
 * row set, and therefore nothing about the other forty-nine.
 */
export type TGroupPlan = {
    group: string;
    sorter: TSorter;
};

/**
 * Everything the scripts will touch, resolved from the data rather than
 * hardcoded — so it stays correct when `n` changes. Every adapter is handed the
 * same plan object.
 */
export type TPlan = {
    /** Ids of view A's window at rest, in order. What the patch scenario writes to. */
    windowA: readonly string[];
    /**
     * Ids in view A's own group, ranked immediately BELOW its window — watched, and
     * off screen. The same count as `windowA`, so the two patch scenarios differ by
     * which rows they write to and nothing else. Their RANKS keep them outside, and
     * `label` is neither filtered nor sorted on, so patching it cannot pull one in.
     */
    outsideA: readonly string[];
    /**
     * The rows the targeted-delivery script PINS: the first {@link PINNED_COUNT} of
     * `outsideA`, and both halves matter. OFF SCREEN, so a pinned row cannot change
     * what a window shows. IN VIEW A'S OWN GROUP, because `patch a row off screen`
     * writes there too — so the same rows are addressed by key in one report row
     * and by position in the other.
     */
    pinned: readonly string[];
    /** Ids that move between group A and group B. */
    movers: readonly string[];
    /** Rows whose rank moves inside view A's window. */
    sorters: readonly TSorter[];
    /** The label each windowed row is patched to. Fixed, so every sample is identical. */
    patchedLabels: readonly string[];
    /** The note each windowed row is patched to — the column nothing reads. */
    patchedNotes: readonly string[];
    /**
     * A LARGE SLICE OF THE WHOLE POPULATION, written in ONE settle — the one script
     * asking what many writes in ONE frame cost. SPREAD ACROSS EVERY GROUP, not the
     * two the views watch: how much of a batch reaches a subscriber is measured.
     */
    batch: readonly string[];
    /** The label each row of `batch` is patched to. */
    batchLabels: readonly string[];
    /**
     * The note each row of `batch` is patched to — same rows, same count, the column
     * nothing reads. A SEPARATE ARRAY, never `batchLabels` reused: the two scripts
     * run in one process against one store, and a shared array would write the same
     * text into two columns.
     */
    batchNotes: readonly string[];
    /**
     * MOST OF THE POPULATION — the rows the sustained-write script patches in EVERY
     * one of its frames. A CONTIGUOUS PREFIX, never a stride: `makeRows` deals
     * round-robin into `GROUPS`, so a prefix covers every group where a stride of 2
     * shares a factor with 50 and misses half. Both windows reached, per `batch`.
     */
    dirty: readonly string[];
    /** The label each row of `dirty` is patched to. Fixed, so every sample is identical. */
    dirtyLabels: readonly string[];
    /**
     * THE RANKS THE DEEP RE-SORT DEALS ROUND VIEW A'S WINDOW — `WINDOW` of them,
     * all DISTINCT, all strictly below the lowest rank OUTSIDE that window.
     *
     * STRICTLY BELOW means MEMBERSHIP cannot move however the ranks are permuted,
     * at any point inside a frame, so the row measures re-ordering and never
     * re-selection. DISTINCT means the permutation is fully observable: repeats
     * would leave some rotations rendering the identical order.
     */
    resortRanks: readonly number[];
    /**
     * ONE ENTRY PER GROUP, in `GROUP_NAMES` order — what the per-group script
     * writes, and the only part of the plan that knows about more than two groups.
     */
    groups: readonly TGroupPlan[];
    /** Rows per group, so a check can say what a full window should hold. */
    groupSize: number;
    /**
     * THE ROWS THE CHURN SCRIPTS SUBSCRIBE TO — and the FIRST ONE must be read by
     * EVERY subscriber of every churn shape. Each cycle writes that one row's
     * `label` and settles, so if a subscriber did not read it, it could be mounted
     * as a no-op and never found out about.
     *
     * A PREFIX OF THE POPULATION rather than a slice of one group: a churn binding
     * derives no view, so which group a row is in is not observable here.
     */
    churnRows: readonly string[];
    /** Their ranks, in the same order — the address half of the churn line. */
    churnRanks: readonly number[];
    /**
     * THE KEYS THE READ-BY-KEY SCRIPT ASKS FOR — `READ_PAGES × WINDOW` of them, one
     * page per step. A STRIDE, never a slice: consecutive keys are a page a store
     * may already have contiguous. These are the KEYS, not the rows — nothing is
     * resolved for an adapter; the lookup IS the measurement.
     */
    readKeys: readonly string[];
    /**
     * WHERE THE SCROLLING SCRIPT PUTS VIEW A'S WINDOW, one offset per step. A
     * scroll step changes the OFFSET and nothing else — no row written, no rank
     * moved, no row set changed.
     *
     * Consecutive offsets always differ, INCLUDING the last of one run against the
     * first of the next, which is what makes the script repeatable; and group A
     * holds two windows, so the deepest offset still shows a FULL one.
     */
    scrollOffsets: readonly number[];
    deepScrollOffsets: readonly number[];
    // Ends on group A, so a run ends where it started and its first switch is a change.
    switchGroups: readonly string[];
    deletedOne: readonly string[];
    /**
     * ROWS WHOSE KEYS THE STORE DOES NOT HOLD — the insert into a populated store.
     * Their ranks are BELOW every rank the population has, so each arrives at the
     * head of its own group's window and every view is changed by the insert; an
     * insert nobody can see would measure the write path with the delivery removed.
     */
    fresh: readonly TRow[];
    /** The same rows' keys, for the untimed restore that takes them out again. */
    freshIds: readonly string[];
    /**
     * ONE BATCH OF BRAND-NEW KEYS PER FRAME OF THE GROWTH SCRIPT — {@link
     * GROWTH_FRAMES} of them, each {@link GROWTH_FRACTION} of the population, and
     * NONE OF THEM REMOVED BETWEEN FRAMES. Batch `k` therefore lands in a store
     * that batches `0 … k-1` already grew, which is the whole difference from
     * `fresh`.
     *
     * RANKED BELOW EVERYTHING AND BELOW EACH OTHER, newest most negative, so every
     * batch arrives at the HEAD of its group's window: a row nobody can see would
     * measure the write path with the delivery taken out. Their band of ranks does
     * not overlap `fresh`'s or the mixed frame's, so a rank found in the wrong
     * script names the script that wrote it.
     *
     * THERE IS NO LIST OF THESE KEYS FOR A RESTORE TO REMOVE, deliberately: the
     * growth script rebuilds and reloads the whole store between samples instead,
     * because a store that has taken eight batches and given one back is not the
     * store the load left. See its `restore`.
     */
    growth: readonly (readonly TRow[])[];
    /**
     * ─── THE FIVE SETS ONE MIXED FRAME WRITES, DISJOINT BY CONSTRUCTION ────
     *
     * The frame that carries an insert, a delete, a column patch, a row set
     * move and an order move AT ONCE. Two of the five are the sets two existing
     * scripts already use — {@link movers} and {@link sorters} — so the mixed row
     * is read against `row moves between groups` and `sort key moves` on the same
     * rows; the other three are here.
     *
     * DISJOINT IS CHECKED, NOT HOPED FOR (`makePlan` throws): a row both patched
     * and deleted in one frame is a race between two of the five, and which of them
     * a store applied last would decide the answer.
     */
    /** New keys the mixed frame inserts, at the head of view A's window. */
    mixedInserted: readonly TRow[];
    /** Their keys, for the untimed restore that takes them out again. */
    mixedInsertedIds: readonly string[];
    /** Rows the mixed frame DELETES — the tail of view A's window, on screen. */
    mixedRemoved: readonly string[];
    /**
     * Rows whose `label` the mixed frame patches — the slots between the movers and
     * the sorters, so the set is on screen and touches neither.
     */
    mixedPatched: readonly string[];
    /** The label each of those is patched to, one to one, in the same order. */
    mixedLabels: readonly string[];
    /**
     * WHERE A MOVER LANDS IN GROUP B WHEN IT ARRIVES MID-ORDER — one rank per
     * mover, all inside view B's window and all in a gap no stored rank occupies.
     *
     * `movers` alone cannot ask this. Their resting ranks are 1…{@link
     * MOVER_COUNT}, below every other row by construction, so `row moves between
     * groups` inserts every one of them at POSITION 0 of the target order — the
     * cheapest arrival there is for a store keeping an ordered bucket, and chosen
     * to make the move visible rather than to be typical.
     */
    arrivalRanks: readonly number[];
    /**
     * ONE ROW OF GROUP A THAT IS ON THE SECOND AXIS, and one that is not — both
     * inside view A's window at rest. Moving each out of group A and back changes
     * BOTH views for the first and only the one-axis view for the second, because
     * the second predicate had already excluded it. That pair is the measurement.
     */
    axisMover: string;
    plainMover: string;
    /**
     * How many rows a two-axis view over group A shows at rest — `WINDOW`, or fewer
     * if group A does not hold that many on the axis. A CHECK MAY NOT SIMPLY DEMAND
     * A FULL WINDOW: the axis halves a group, and at the smallest population these
     * scripts run at, half of group A is about one window.
     */
    axisWindowSize: number;
    /**
     * THE ROWS BOTH RELATION SCRIPTS RENDER — {@link RELATION_ROWS} of them, whose
     * owners are {@link RELATION_TOUCHED} in number by CONSTRUCTION (see
     * `makePlan`). A PREFIX-DERIVED SET, for `churnRows`' reason.
     */
    relationRows: readonly string[];
    /** Their ranks, in the same order — the address half of a relation line. */
    relationRanks: readonly number[];
    /** The owner of each of those rows, in the same order. */
    relationRowOwners: readonly string[];
    /**
     * THE OWNERS THE JOIN SCRIPT WRITES, in step order — the distinct parents of
     * `relationRows`, each owning exactly two of them.
     */
    relationOwners: readonly string[];
    /**
     * Their names AT REST, so the untimed restore puts back exactly what the load
     * wrote and every sample starts from the state the model starts from.
     */
    relationNames: readonly string[];
    /**
     * THE MARK EACH PAIR RECORD HOLDS AT REST — one per row of `relationRows`,
     * written when the records are created, before the clock, so every step of the
     * composite-key script is a RESOLUTION AND AN UPDATE and never a mint. Minting
     * on the first run and updating afterwards folds two operations into one number.
     */
    pairSeeds: readonly string[];
};

/**
 * How much of the population one batched write touches: a fraction, so it scales
 * with `BENCH_N`, floored at four windows so a small run still writes several
 * times what either view can show — a batch the size of a window would be
 * measuring a window refresh again.
 */
const BATCH_FRACTION = 10;

/**
 * THE ROW ONE GROUP'S STEP MOVES, and the two ranks it moves between — both inside
 * that group's own window, both GUARANTEED to reorder it.
 *
 * THE ANCHORS ARE SEARCHED FOR RATHER THAN COMPUTED because `rankFor` scatters, so
 * two rows of one group can share a rank; if `held[a]` and `held[a + 1]` do, `+1`
 * sorts the mover AFTER both — the position it already held — and the row fails for
 * every adapter at once on a hash collision. An anchor is therefore a position where
 * the rank STRICTLY increases, and `anchor.rank + 1` lands in a gap no row holds.
 *
 * The anchors are FRACTIONS OF THE WINDOW, because the per-shape-change cost some
 * libraries pay is LINEAR IN THE WINDOW. The mover is `lowSlot + 2` and the search
 * guarantees `highSlot > lowSlot + 2`, so the mover is NEVER an anchor — writing an
 * anchor's own rank would move the target it is measured against.
 */
const sorterInWindow = (group: string, held: readonly TRow[]): TSorter => {
    const lowAnchor = Math.max(MOVER_COUNT + 1, Math.floor(WINDOW * 0.15));
    const highAnchor = Math.floor(WINDOW * 0.8);
    let lowSlot = lowAnchor;
    while (lowSlot < highAnchor && held[lowSlot].rank >= held[lowSlot + 1].rank) {
        lowSlot++;
    }
    let highSlot = highAnchor;
    while (
        highSlot > lowSlot + 2 &&
        held[highSlot].rank >= held[highSlot + 1].rank
    ) {
        highSlot--;
    }
    if (
        highSlot <= lowSlot + 2 ||
        held[lowSlot].rank >= held[lowSlot + 1].rank ||
        held[highSlot].rank >= held[highSlot + 1].rank
    ) {
        throw new Error(
            `group ${group} has no pair of strictly increasing ranks between positions ${lowAnchor} ` +
                `and ${highAnchor}, so no rank move inside its window can be guaranteed to reorder ` +
                'it. Raise BENCH_WINDOW or BENCH_N.'
        );
    }
    const mover = held[lowSlot + 2];
    return {
        id: mover.id,
        rest: mover.rank,
        // Odd offsets into a gap: every rank is 1000 plus a multiple of 200 and
        // both anchors are strictly below their successors, so `+1` is a place no
        // other row of this group can hold and nothing is left to a tie.
        low: held[lowSlot].rank + 1,
        high: held[highSlot].rank + 1,
    };
};

export const makePlan = (rows: readonly TRow[]): TPlan => {
    // EVERY GROUP, BUCKETED ONCE AND SORTED ONCE — one pass, because this runs in
    // every worker process before anything is measured.
    const grouped = new Map<string, TRow[]>();
    for (const name of GROUP_NAMES) grouped.set(name, []);
    for (const row of rows) {
        const held = grouped.get(row.group);
        if (held === undefined) grouped.set(row.group, [row]);
        else held.push(row);
    }
    for (const held of grouped.values()) held.sort(compareRows);
    const inA = grouped.get(GROUP_A) ?? [];
    // Two windows' worth: one on screen, one immediately behind it. The second is
    // what the off-screen patch scenario writes to and what the deletion
    // scenario's window refills from.
    const needed = Math.max(WINDOW + MOVER_COUNT + 4, WINDOW * 2);
    // ASKED OF EVERY GROUP, not only of group A: the per-group script subscribes
    // to all fifty and demands a full window from each, so a group A alone check
    // is the difference between a clear message here and fifty adapters failing.
    for (const [name, held] of grouped) {
        if (held.length < needed) {
            throw new Error(
                `dataset too small: group ${name} holds ${held.length} rows, and the scripts need ` +
                    `at least ${needed} (two windows of ${WINDOW}). Raise BENCH_N or lower BENCH_WINDOW.`
            );
        }
    }
    // Group B is resolved for one reason: the batch has to prove it reaches view
    // B's window.
    const inB = grouped.get(GROUP_B) ?? [];
    // Positions 0..MOVER_COUNT-1 are the movers, by construction of `rankFor`.
    const movers = inA.slice(0, MOVER_COUNT).map(row => row.id);
    // The sorters and both of their target ranks sit well inside the window, so a
    // sort-key move REORDERS the window without changing which rows are in it.
    // The anchors are fractions of the window; see `sorterInWindow`.
    const lowAnchor = Math.max(MOVER_COUNT + 1, Math.floor(WINDOW * 0.15));
    const highAnchor = Math.floor(WINDOW * 0.8);
    const room = Math.floor((highAnchor - lowAnchor - 3) / 2);
    const sorterCount = Math.max(1, Math.min(SORTER_COUNT, room));
    const sorters: TSorter[] = [];
    for (let j = 0; j < sorterCount; j++) {
        const row = inA[lowAnchor + 2 + j * 2];
        sorters.push({
            id: row.id,
            rest: row.rank,
            // Odd offsets into a gap, as `sorterInWindow` does it.
            low: inA[lowAnchor].rank + 1 + j,
            high: inA[highAnchor].rank + 1 + j,
        });
    }
    const windowA = inA.slice(0, WINDOW).map(row => row.id);
    const windowB = inB.slice(0, WINDOW).map(row => row.id);

    // THE BATCH — the rows one settled frame writes to, taken at rest. See
    // `BATCH_FRACTION`.
    const batchSize = Math.min(
        rows.length,
        Math.max(WINDOW * 4, Math.floor(rows.length / BATCH_FRACTION))
    );
    // A STRIDE THROUGH EVERYTHING, not a slice and not the two watched groups, so
    // most of the batch lands where nobody is subscribed — the shape a sync
    // response or bulk edit has.
    //
    // THE STEP MUST BE COPRIME WITH `GROUPS` or the spread is a fiction: with
    // `group = g(i % GROUPS)`, a step sharing a factor with GROUPS visits only every
    // gcd-th group. At the default 10 000 rows the natural step is exactly 10, which
    // touches g0, g10, g20, g30, g40 and nothing else — group B among the 45 it
    // never reaches. Stepping down to the next coprime value keeps the walk regular
    // and inside the array, since a shorter step ends sooner.
    let stride = Math.max(1, Math.floor(rows.length / batchSize));
    while (stride > 1 && gcd(stride, GROUPS) !== 1) stride--;
    const batchAt: number[] = new Array(batchSize);
    for (let i = 0; i < batchSize; i++) batchAt[i] = i * stride;
    // BOTH WINDOWS HAVE TO BE HIT, and it is not left to arithmetic. View A's is
    // reached by construction — `rows[0]` is a group-A mover pinned to the head of
    // the window — but WHICH of group B's rows are in its window is decided by the
    // rank hash, so whether the stride lands on one is an accident of `n`. The
    // scenario asserts one settle produces exactly one new state in EACH view, so a
    // stride stepping over view B's window would fail every adapter for a property
    // of the dataset. Where it misses, the batch's first row of that group is
    // swapped for the window's head: same size, same spread.
    const indexById = new Map(rows.map((row, index) => [row.id, index] as const));
    // TAKES THE INDEX ARRAY rather than closing over one: two scripts write a large
    // set in one frame and both assert what reached each view, so one body serves
    // both and the two sets cannot come to differ.
    const reachInto = (
        at: number[],
        windowIds: readonly string[],
        group: string,
        what: string
    ): void => {
        const visible = new Set(windowIds);
        if (at.some(index => visible.has(rows[index].id))) return;
        const slot = at.findIndex(index => rows[index].group === group);
        const head = indexById.get(windowIds[0]);
        if (slot < 0 || head === undefined) {
            throw new Error(
                `the ${what} of ${at.length} rows reaches no row of group ${group} at all, so it ` +
                    'cannot be made to reach that view. Raise BENCH_N.'
            );
        }
        at[slot] = head;
    };
    reachInto(batchAt, windowA, GROUP_A, 'batch');
    reachInto(batchAt, windowB, GROUP_B, 'batch');

    // THE DIRTY SET — a contiguous prefix covers every group evenly because
    // `makeRows` deals round-robin; see `TPlan.dirty` for why a stride would not.
    const dirtySize = Math.max(1, Math.floor(rows.length / DIRTY_FRACTION));
    const dirtyAt: number[] = new Array(dirtySize);
    for (let i = 0; i < dirtySize; i++) dirtyAt[i] = i;
    reachInto(dirtyAt, windowA, GROUP_A, 'dirty set');
    reachInto(dirtyAt, windowB, GROUP_B, 'dirty set');

    // THE TWO-AXIS MOVERS — one row of view A's window on the second axis and one
    // not. Taken from the WINDOW rather than the whole group so BOTH are visible
    // to a one-axis view: a two-axis view reacting to one and not the other is
    // only a difference if a one-axis view reacts to both.
    const axisMoverRow = inA.slice(0, WINDOW).find(row => onSecondAxis(row.id));
    const plainMoverRow = inA.slice(0, WINDOW).find(row => !onSecondAxis(row.id));
    if (axisMoverRow === undefined || plainMoverRow === undefined) {
        throw new Error(
            `view A's window of ${WINDOW} rows holds no row ` +
                `${axisMoverRow === undefined ? 'ON' : 'OFF'} the second axis, so the two-axis ` +
                'script has nothing to move that the second predicate treats differently from the ' +
                'first. Raise BENCH_WINDOW or BENCH_N.'
        );
    }
    const onAxisInA = inA.reduce(
        (held, row) => (onSecondAxis(row.id) ? held + 1 : held),
        0
    );

    // THE SCROLL PATH — out to a full window and back to zero, in equal strides.
    // See `TPlan.scrollOffsets`.
    const turn = SCROLL_STEPS / 2;
    const scrollStride = Math.max(1, Math.floor(WINDOW / turn));
    const scrollOffsets = Array.from({ length: SCROLL_STEPS }, (_, step) =>
        step < turn ? scrollStride * (step + 1) : scrollStride * (SCROLL_STEPS - 1 - step)
    );
    const deepStride = Math.max(1, Math.floor((inA.length - WINDOW) / turn));
    const deepScrollOffsets = Array.from({ length: SCROLL_STEPS }, (_, step) =>
        step < turn ? deepStride * (step + 1) : deepStride * (SCROLL_STEPS - 1 - step)
    );

    const switchStride = Math.floor((GROUPS - 2) / (SWITCH_STEPS - 1));
    if (switchStride < 1) {
        throw new Error(
            `SWITCH_STEPS is ${SWITCH_STEPS}, more than the ${GROUPS - 2} groups beside the two ` +
                'watched ones, so the view-switch script would revisit a group before it returns.'
        );
    }
    const switchGroups = [
        ...Array.from({ length: SWITCH_STEPS - 1 }, (_, i) => GROUP_NAMES[2 + i * switchStride]),
        GROUP_A,
    ];

    // See `TPlan.readKeys`.
    const readCount = Math.min(rows.length, READ_PAGES * WINDOW);
    const readStride = Math.max(1, Math.floor(rows.length / readCount));
    const readKeys: string[] = new Array(readCount);
    for (let i = 0; i < readCount; i++) readKeys[i] = rows[i * readStride].id;

    // Dealt round-robin into the same groups `makeRows` deals into, and ranked
    // below everything the population holds. See `TPlan.fresh`.
    const fresh: TRow[] = Array.from({ length: INSERT_COUNT }, (_, i) => ({
        id: scrambledText('f', i),
        group: `g${i % GROUPS}`,
        rank: -(i + 1),
        label: scrambledText('i', i),
        note: scrambledText('k', i),
    }));

    // Ranked strictly below `fresh`'s band and below each other, newest first.
    // See `TPlan.growth`.
    const growthBatch = Math.max(
        INSERT_COUNT,
        Math.floor(rows.length / GROWTH_FRACTION)
    );
    const growth: TRow[][] = [];
    for (let f = 0; f < GROWTH_FRAMES; f++) {
        const batch: TRow[] = new Array(growthBatch);
        for (let i = 0; i < growthBatch; i++) {
            const minted = f * growthBatch + i;
            batch[i] = {
                id: scrambledText('h', minted),
                group: `g${minted % GROUPS}`,
                rank: -(INSERT_COUNT + MOVER_COUNT + 1 + minted),
                label: scrambledText('j', minted),
                note: scrambledText('u', minted),
            };
        }
        growth.push(batch);
    }

    // THE FIVE SETS OF ONE MIXED FRAME, and the guard that keeps them apart. The
    // movers hold slots 0…MOVER_COUNT-1 of view A's window and the sorters slots
    // lowAnchor+2 upwards in steps of two; the patched set takes what lies between
    // them and the deleted set the window's last MOVER_COUNT slots.
    const lastSorterSlot = lowAnchor + 2 + 2 * (sorterCount - 1);
    const mixedRemovedFrom = WINDOW - MOVER_COUNT;
    if (lowAnchor + 2 > mixedRemovedFrom || lastSorterSlot >= mixedRemovedFrom) {
        throw new Error(
            `the mixed frame's five sets overlap at this window: the movers hold slots 0…` +
                `${MOVER_COUNT - 1}, the patched set ${MOVER_COUNT}…${lowAnchor + 1}, the sorters up ` +
                `to slot ${lastSorterSlot}, and the deleted set ${mixedRemovedFrom}…${WINDOW - 1}. A ` +
                'row written by two of the five in one frame makes the answer depend on which the ' +
                'store applied last. Raise BENCH_WINDOW.'
        );
    }
    const mixedPatchedRows = inA.slice(MOVER_COUNT, lowAnchor + 2);
    const mixedInserted: TRow[] = Array.from({ length: MOVER_COUNT }, (_, i) => ({
        id: scrambledText('m', i),
        group: GROUP_A,
        rank: -(INSERT_COUNT + 1 + i),
        label: scrambledText('t', i),
        note: scrambledText('a', i),
    }));

    // WHERE A MOVER ARRIVES WHEN IT ARRIVES MID-ORDER — `sorterInWindow`'s search
    // over group B, for its reason: `rankFor` scatters, so two rows of one group
    // can share a rank, and an anchor with no strict increase above it gives every
    // mover a rank the row already there also holds. Every rank is 1000 plus a
    // multiple of 200, so a strict increase leaves a gap of at least 200 and all
    // MOVER_COUNT offsets land in it.
    const arrivalLow = Math.max(1, Math.floor(WINDOW * 0.3));
    const arrivalHigh = Math.floor(WINDOW * 0.7);
    let arrivalSlot = arrivalLow;
    while (
        arrivalSlot < arrivalHigh &&
        inB[arrivalSlot].rank >= inB[arrivalSlot + 1].rank
    ) {
        arrivalSlot++;
    }
    if (inB[arrivalSlot].rank >= inB[arrivalSlot + 1].rank) {
        throw new Error(
            `group ${GROUP_B} has no pair of strictly increasing ranks between positions ` +
                `${arrivalLow} and ${arrivalHigh}, so no arrival rank can be guaranteed to land a ` +
                'mover strictly inside that window rather than tied with the row already there. ' +
                'Raise BENCH_WINDOW or BENCH_N.'
        );
    }
    const arrivalRanks = movers.map((_, j) => inB[arrivalSlot].rank + 1 + j);

    // THE RELATION ROWS, PICKED SO THE SHARING IS A CONSTRUCTION: `ownerOf` is the
    // last two decimal digits and there are exactly `OWNERS` = 100 owners, so
    // `rows[k]` and `rows[OWNERS + k]` point at the SAME owner for every `k`, by
    // arithmetic, at every population. Not a search, unlike `sorterInWindow`: this
    // property CAN be computed. The `k`-major order puts each owner's two lines
    // apart in the render, so a delivery that moved one of a pair and not the other
    // is visible in the text and not only in a digest.
    if (rows.length <= OWNERS + RELATION_TOUCHED) {
        throw new Error(
            `the relation scripts need ${OWNERS + RELATION_TOUCHED} rows so that a row and the row ` +
                `${OWNERS} positions after it exist and share an owner; this dataset holds ` +
                `${rows.length}. Raise BENCH_N.`
        );
    }
    const relationRowsAt: number[] = [];
    for (let k = 0; k < RELATION_TOUCHED; k++) relationRowsAt.push(k);
    for (let k = 0; k < RELATION_TOUCHED; k++) relationRowsAt.push(OWNERS + k);
    if (relationRowsAt.length !== RELATION_ROWS) {
        throw new Error(
            `RELATION_ROWS is ${RELATION_ROWS} but ${RELATION_TOUCHED} owners with two rows each ` +
                `is ${relationRowsAt.length}. The two constants state one fact and must agree.`
        );
    }
    const relationRows = relationRowsAt.map(index => rows[index].id);
    const relationRowOwners = relationRows.map(ownerOf);
    const relationOwners = OWNER_IDS.slice(0, RELATION_TOUCHED);

    const ceiling = inA[WINDOW].rank;
    if (ceiling - WINDOW <= 0) {
        throw new Error(
            `the lowest rank outside view A's window is ${ceiling}, which leaves no room for ` +
                `${WINDOW} distinct ranks below it. The deep re-sort script deals the window ` +
                'ranks from that gap, so it cannot run at this dataset.'
        );
    }

    return {
        windowA,
        outsideA: inA.slice(WINDOW, WINDOW * 2).map(row => row.id),
        // The head of `outsideA` — `inA` holds two windows by the guard above, so
        // this slice is always full. See `TPlan.pinned`.
        pinned: inA.slice(WINDOW, WINDOW + PINNED_COUNT).map(row => row.id),
        movers,
        sorters,
        patchedLabels: Array.from(
            { length: WINDOW },
            (_, i) => scrambledText('p', i)
        ),
        patchedNotes: Array.from(
            { length: WINDOW },
            (_, i) => scrambledText('q', i)
        ),
        batch: batchAt.map(index => rows[index].id),
        // One-to-one: position i of `batch` is written position i of this. FIXED
        // rather than derived from the row, so every sample and the verification
        // run write identical values.
        batchLabels: Array.from(
            { length: batchSize },
            (_, i) => scrambledText('b', i)
        ),
        // The same one-to-one shape on the column nothing reads.
        batchNotes: Array.from(
            { length: batchSize },
            (_, i) => scrambledText('c', i)
        ),
        dirty: dirtyAt.map(index => rows[index].id),
        dirtyLabels: Array.from(
            { length: dirtySize },
            (_, i) => scrambledText('d', i)
        ),
        // DESCENDING from just under the ceiling, so the frame that rotates by one
        // hands view A's first row the second-largest rank and its last row the
        // largest — a near-reversal of the resting order, which makes the very
        // first frame a visible re-sort rather than a nudge.
        resortRanks: Array.from({ length: WINDOW }, (_, j) => ceiling - 1 - j),
        // ONE PER GROUP, in the order the groups are named, so the fifty steps of
        // the per-group script and the fifty consumers the harness builds are the
        // same fifty groups in the same order.
        groups: GROUP_NAMES.map(group => ({
            group,
            sorter: sorterInWindow(group, grouped.get(group) ?? []),
        })),
        groupSize: inA.length,
        // In dataset order: a churn binding derives nothing, so no group, window
        // or rank matters. See `TPlan.churnRows`.
        churnRows: rows.slice(0, CHURN_ROWS).map(row => row.id),
        churnRanks: rows.slice(0, CHURN_ROWS).map(row => row.rank),
        readKeys,
        scrollOffsets,
        deepScrollOffsets,
        switchGroups,
        deletedOne: Array.from(
            { length: DELETE_ONE_STEPS },
            (_, i) => windowA[Math.floor((i * WINDOW) / DELETE_ONE_STEPS)]
        ),
        fresh,
        freshIds: fresh.map(row => row.id),
        growth,
        mixedInserted,
        mixedInsertedIds: mixedInserted.map(row => row.id),
        mixedRemoved: inA.slice(mixedRemovedFrom, WINDOW).map(row => row.id),
        mixedPatched: mixedPatchedRows.map(row => row.id),
        // FIXED rather than derived from the row, so every sample and the
        // verification run write identical values — `batchLabels`' reason.
        mixedLabels: mixedPatchedRows.map(
            (_, i) => scrambledText('e', i)
        ),
        arrivalRanks,
        axisMover: axisMoverRow.id,
        plainMover: plainMoverRow.id,
        axisWindowSize: Math.min(WINDOW, onAxisInA),
        relationRows,
        relationRanks: relationRowsAt.map(index => rows[index].rank),
        relationRowOwners,
        relationOwners,
        // Spelled the same way `makeOwners` spells it. See `TPlan.relationNames`.
        relationNames: relationOwners.map((_, i) => `w${i}`),
        pairSeeds: Array.from(
            { length: RELATION_ROWS },
            (_, i) => scrambledText('z', i)
        ),
    };
};

/** A fresh copy of the rows, values identical, objects and array not shared. */
export const cloneRows = (rows: readonly TRow[]): TRow[] =>
    rows.map(row => ({ ...row }));

export const cloneOwners = (owners: readonly TOwner[]): TOwner[] =>
    owners.map(owner => ({ ...owner }));
