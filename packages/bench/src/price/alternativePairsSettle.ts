import {
    OIMChannelService,
    OIMDB,
    OIMDefaults,
    OIMSlotStoreServiceMapDriven,
    createOIMComputedService,
    oimSameValueZeroGuard,
} from '../../../core/src/index';
import type { TOIMComputedColumnSlot, TOIMComputedSlot, TOIMSlot } from '../../../core/src/index';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';

/**
 * WHO GOES LOOKING — a computed walking its sources when it is READ, or a source
 * stamping its computeds when it CHANGES.
 *
 * THE COMPARISON WAS RUN AND NEVER WRITTEN DOWN. The earlier run reported pull
 * ahead everywhere by 4% to 64% [NO RUN BEHIND THIS FIGURE] and had one hole:
 * CHAIN DEPTH THERE WAS ONE. A computed over a computed over a computed was not
 * measured, and that is what could reverse the verdict — so the three rows here
 * are depth 1, 2 and 3 over one geometry.
 *
 * ─── WHAT "PUSH" IS HERE, BECAUSE THE WORD HAS THREE MEANINGS ────────────
 *
 * It is INVALIDATION push: the write walks the transitive dependents and sets a
 * dirty flag, stopping wherever the flag is already set; the read then finds out
 * in ONE BOOLEAN that it owes a derivation, instead of comparing a reading
 * against every source. Its read is CHEAPER than ours — that is the design's
 * whole claim — and it pays for it at the write.
 *
 * IT IS NOT THE EAGER ARM. Recomputing at the write is a different design and is
 * priced next door, at `alt.coalesce-vs-eager.*` in
 * `alternativePairsDispatch.ts`; that pair asks WHEN the work happens and this
 * one asks WHO FINDS IT. Nothing here recomputes anything a reader did not ask
 * for, on either arm.
 *
 * A push that only stamped, and then walked its sources at the read to bring
 * them current, would BE our arm with a boolean added — so the push arm's read
 * descends by the flag, which is the only form of the design worth pricing.
 *
 * ─── WHY OUR ARM IS THE SHIPPED CLASS AND THE OTHER IS NOT ───────────────
 *
 * `oimRefreshComputedSlot` is pull, so our arm can be the real thing: the shipped
 * `OIMComputedService` built by `createOIMComputedService`, the shipped `oimHasSourceChangedSinceLastRun`, the shipped `oimIsRevisionAfter`,
 * the shipped comparator gate, and `OIMChannelService.write` as the writer. The engine
 * has no push, so that arm is written here — as lean as the design allows, with
 * the same two source lists, the same computeds-first order and the same
 * "hold the value if it did not change" gate, and NOT ONE FIELD MORE. Every
 * asymmetry that leaves is against us and is listed under each row.
 *
 * READ THE RATIO BACKWARDS. `floor` is the design that lost, so BELOW 1.00 is
 * the shipped settle winning and ABOVE 1.00 is the decision being wrong.
 */

/**
 * A ROOT — a slot as `OIMChannelService.write` needs one, with the value a derivation
 * reads and the dependent list the push arm marks through.
 *
 * BOTH ARMS ALLOCATE THIS SHAPE, and our arm never reads `dependents`. Two
 * different shapes would be two different hidden classes reaching the two
 * derive bodies, which is a difference the instrument introduced rather than one
 * either design has.
 */
type TChainRoot = TOIMSlot & {
    value: number;
    dependents: PushNode[] | undefined;
};

const makeRoot = (): TChainRoot => ({
    effects: undefined,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    effectEdges: undefined,
    holdCount: 0,
    releaseDueAfterWriteMs: -1,
    releaseDueAfterIdleMs: -1,
    releaseDueAfterUnholdMs: -1,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    columnSlotStore: undefined,
    storeSlot: undefined,
    owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
    value: 0,
    dependents: undefined,
});

/**
 * THE GEOMETRY, AS THE RECOVERED TABLE HAD IT: 200 consumers over 300 roots at
 * fan-in 3. Kept rather than re-chosen so that a fresh reading of depth 1 can be
 * put beside the recovered figure and asked whether it reproduces.
 */
const ROOTS = 300;
const NODES_PER_LEVEL = 200;
const FAN_IN = 3;

/**
 * ONE OPERATION IS ONE FRAME: every root written, then every consumer read.
 *
 * Not one write and not one read. The two designs move work BETWEEN those two
 * halves, so a row timing either half alone would report whichever half its
 * author picked; the only unit that cannot be gamed that way is the pair.
 */

/** The values a frame writes, rotated so no write is ever a re-send of what is there. */
const VALUES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

/* ── the shipped design: nothing at the write, a walk at the read ───────── */

/**
 * OUR ARM'S SUMS. Level one sums roots; every level above reads its sources through their computed value service.
 *
 * THE PUSH ARM CALLS NEITHER. Its sum is written out inside `PushNode.settle`
 * instead, and the duplication is the point: two arms summing through one
 * compiled function would each be measured through inline caches the other had
 * taught, which is the pollution `TPricePair.isolate` spends five processes to
 * avoid and which a second call site gives for nothing.
 */
const sumForPull = (sources: readonly TChainRoot[]): number => {
    let sum = 0;
    for (let i = 0; i < sources.length; i++) sum += sources[i].value;
    return sum;
};

const sumOfComputedsForPull = (sourceComputeds: readonly TOIMComputedSlot<number, number>[]): number => {
    let sum = 0;
    for (let i = 0; i < sourceComputeds.length; i++) {
        const sourceComputed = sourceComputeds[i];
        sum += sourceComputed.computedValueService.getValueForSlot(sourceComputed);
    }
    return sum;
};

/**
 * WHICH SOURCES NODE `j` READS — one rule, applied to both arms' levels, so the
 * two graphs are the same graph and a difference between the rows cannot be a
 * difference in wiring.
 */
const pickFrom = <T>(from: readonly T[], j: number): T[] => {
    const mine: T[] = [];
    for (let k = 0; k < FAN_IN; k++) mine.push(from[(j * FAN_IN + k) % from.length]);
    return mine;
};

const rootLevelComputedService = (
    db: OIMDB, roots: readonly TChainRoot[],
) => {
    const rootsByNode: TChainRoot[][] = [];
    for (let j = 0; j < NODES_PER_LEVEL; j++) rootsByNode.push(pickFrom(roots, j));
    const computedService = createOIMComputedService<number, number>({
        sameValueGuard: oimSameValueZeroGuard,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
    });
    const computedStoreSlot = computedService.createComputedStoreSlot(
        db,
        computedSlot => sumForPull(rootsByNode[computedSlot.key]),
        j => ({ sourceSlots: rootsByNode[j] }),
    );
    return { computedService, computedStoreSlot };
};

const computedLevelComputedService = (
    db: OIMDB, belowComputedSlots: readonly TOIMComputedSlot<number, number>[],
) => {
    const sourceComputedsByNode: TOIMComputedSlot<number, number>[][] = [];
    for (let j = 0; j < NODES_PER_LEVEL; j++) sourceComputedsByNode.push(pickFrom(belowComputedSlots, j));
    const computedService = createOIMComputedService<number, number>({
        sameValueGuard: oimSameValueZeroGuard,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
    });
    const computedStoreSlot = computedService.createComputedStoreSlot(
        db,
        computedSlot => sumOfComputedsForPull(sourceComputedsByNode[computedSlot.key]),
        j => ({ sourceComputeds: sourceComputedsByNode[j] }),
    );
    return { computedService, computedStoreSlot };
};

const buildPullChain = (depth: number) => {
    const db = new OIMDB();
    const roots: TChainRoot[] = [];
    for (let i = 0; i < ROOTS; i++) roots.push(makeRoot());

    let top = rootLevelComputedService(db, roots);
    let below: TOIMComputedSlot<number, number>[] = [];
    for (let level = 0; level < depth; level++) {
        if (level > 0) top = computedLevelComputedService(db, below);
        const built: TOIMComputedSlot<number, number>[] = [];
        const computedCollectionService = top.computedService.computedCollectionService;
        for (let j = 0; j < NODES_PER_LEVEL; j++) built.push(computedCollectionService.holdSlotByKey(top.computedStoreSlot, j));
        below = built;
    }

    const topSlots = below;
    // The first settle, outside the clock: every node is born owing a derivation
    // and the frame that paid for it would be a frame unlike every other.
    const computedValueService = top.computedService.computedCollectionService.slotContentService;
    for (let i = 0; i < topSlots.length; i++) priceSink.number = computedValueService.getValueForSlot(topSlots[i]);
    return { db, roots, computedValueService, top: topSlots };
};

/* ── the design that lost: a stamp at the write, a boolean at the read ──── */

/**
 * A NODE OF THE REJECTED GRAPH — the same two source lists a computed slot
 * carries, the same computeds-first order, the same value-held gate, plus the
 * one field the design exists for and the one field it needs to propagate.
 */
class PushNode {
    public value = 0;
    /**
     * SOMETHING I READ HAS CHANGED — set by the write, cleared by the read that
     * acts on it. Born set, because a node that has never derived owes one.
     */
    public dirty = true;
    /** Who must be marked when this node's value changes. */
    public dependents: PushNode[] | undefined = undefined;

    public constructor(
        private readonly sourceRoots: readonly TChainRoot[],
        private readonly sourceNodes: readonly PushNode[],
    ) {}

    /**
     * ONE BOOLEAN DECIDES IT, which is the whole of what push buys: no reading is
     * compared against any source, because the write already said so.
     *
     * COMPUTEDS FIRST, for the reason `oimRefreshSourceComputeds` exists: a source
     * node's value is whatever its last derivation left there, so it is brought
     * current before it is read.
     */
    public settle(): void {
        if (!this.dirty) return;
        const nodes = this.sourceNodes;
        for (let i = 0; i < nodes.length; i++) nodes[i].settle();
        const roots = this.sourceRoots;
        let sum = 0;
        for (let i = 0; i < roots.length; i++) sum += roots[i].value;
        for (let i = 0; i < nodes.length; i++) sum += nodes[i].value;
        this.dirty = false;
        if (sum === this.value) return;
        this.value = sum;
    }
}

/**
 * THE PROPAGATION, AND ITS ONE OPTIMISATION: a node already dirty stops the
 * walk, because everything above it was marked when it was.
 *
 * That is what keeps a batch from being quadratic and it is given to the design
 * in full — without it the arm would be a strawman rather than the thing that
 * lost.
 */
const markDependents = (dependents: PushNode[] | undefined): void => {
    if (dependents === undefined) return;
    for (let i = 0; i < dependents.length; i++) {
        const node = dependents[i];
        if (node.dirty) continue;
        node.dirty = true;
        markDependents(node.dependents);
    }
};

const buildPushChain = (depth: number) => {
    const db = new OIMDB();
    const roots: TChainRoot[] = [];
    for (let i = 0; i < ROOTS; i++) roots.push(makeRoot());

    let below: PushNode[] = [];
    for (let level = 0; level < depth; level++) {
        const built: PushNode[] = [];
        for (let j = 0; j < NODES_PER_LEVEL; j++) {
            if (level === 0) {
                const mine = pickFrom(roots, j);
                const node = new PushNode(mine, []);
                for (const root of mine) (root.dependents ??= []).push(node);
                built.push(node);
            } else {
                const mine = pickFrom(below, j);
                const node = new PushNode([], mine);
                for (const source of mine) (source.dependents ??= []).push(node);
                built.push(node);
            }
        }
        below = built;
    }

    const top = below;
    for (let i = 0; i < top.length; i++) top[i].settle();
    return { db, roots, top };
};

const buildDepth = (depth: number) => {
    const pull = buildPullChain(depth);
    const push = buildPushChain(depth);
    /**
     * THE FRAME COUNTER RUNS ACROSS PASSES, per arm. Restarted at 0 by every
     * timed pass it would occasionally hand a root the value it already holds at
     * a pass boundary, and a frame in which nothing changed is a frame the two
     * arms answer DIFFERENTLY — our comparator cuts the chain, and a marked node
     * is walked anyway. One frame in a pass, decided by where the pass happened
     * to end, is exactly the kind of difference that has no business in a ratio.
     */
    let pullFrame = 0;
    let pushFrame = 0;
    return {
        ours: {
            reset: () => undefined,
            run: (times: number): void => {
                const { db, roots, computedValueService, top } = pull;
                const channelSlot = db.defaultChannelSlot;
                let sunk = 0;
                for (let pass = 0; pass < times; pass++) {
                    const value = VALUES[pullFrame++ & 7];
                    for (let i = 0; i < roots.length; i++) {
                        const root = roots[i];
                        OIMChannelService.INSTANCE.write(channelSlot, root);
                        root.value = value + i;
                    }
                    for (let i = 0; i < top.length; i++) {
                        sunk += computedValueService.getValueForSlot(top[i]);
                    }
                }
                priceSink.number = sunk;
            },
        },
        floor: {
            reset: () => undefined,
            run: (times: number): void => {
                const { db, roots, top } = push;
                const channelSlot = db.defaultChannelSlot;
                let sunk = 0;
                for (let pass = 0; pass < times; pass++) {
                    const value = VALUES[pushFrame++ & 7];
                    for (let i = 0; i < roots.length; i++) {
                        const root = roots[i];
                        OIMChannelService.INSTANCE.write(channelSlot, root);
                        root.value = value + i;
                        markDependents(root.dependents);
                    }
                    for (let i = 0; i < top.length; i++) {
                        const node = top[i];
                        node.settle();
                        sunk += node.value;
                    }
                }
                priceSink.number = sunk;
            },
        },
    };
};

/**
 * WHAT EVERY ROW IN THIS FILE SHARES. One text, appended to three caveats,
 * because three copies of a paragraph are three things that can drift apart.
 */
const SHARED_RESIDUALS =
    'RESIDUALS. AGAINST US, AND THEY ARE THE MAJORITY: our arm is the SHIPPED ' +
    '`OIMComputedService` (from `createOIMComputedService`), one per level, each node a held computed slot read through ' +
    'the computed collection service\'s `slotContentService.getValueForSlot`, so every read pays `assertNotReleased` and a call into ' +
    '`oimRefreshComputedSlot`; every refresh that misses the clock pays `oimRefreshSourceComputeds`, a ' +
    'call into `oimHasSourceChangedSinceLastRun`, a call into `oimIsRevisionAfter` per source, a call ' +
    'into the comparator, `isDeriving` written twice and THREE pairs of stamps written per ' +
    'derivation (`ranAt*`, `checkedAt*` and `changedAt*`) — the rejected arm carries one boolean ' +
    'and writes it once. Above level one the derive reads each source computed through its owner ' +
    'AGAIN, after `oimRefreshSourceComputeds` already brought it current, so each such source costs ' +
    'one more `getValueForSlot` that returns on its `checkedAt` pair, and the derive finds its ' +
    'source list by the slot\'s key. Our nodes are also filed as slots in a `Map` per level, with ' +
    '`effects`, `holdCount`, `owner` and `key` on every one of them, and the rejected node has ' +
    'none of that. AGAINST THE REJECTED ARM: nothing, except that ' +
    'it walks a recursive `markDependents` where a real engine might flatten it. WHAT NEITHER ARM ' +
    'PAYS: the frame. No effect is subscribed and `db.flush()` is never called, so the leaf ' +
    'list, the drain and the after-frame phases are on neither side — a frame is priced by ' +
    '`flush.empty-vs-noop` and adding it to both halves of a ratio only pulls it toward 1. ' +
    'WHAT IS NOT EXERCISED, and it is the design difference that no timing here can show: push ' +
    'marks the WHOLE transitive cone at the write, while pull stops at the first computed whose ' +
    'value held. Every root moves every frame here and every sum therefore changes, so the ' +
    'comparator never cuts anything on either arm and push is never charged for a mark it did not ' +
    'owe. A graph where a change is absorbed part-way up is the arrangement in which push is at ' +
    'its worst, and it is not measured. NOR IS THE CONSUMER AXIS: the recovered table reported ' +
    'the two converging where ten consumers share one computed, and every node here is read by ' +
    'exactly one consumer.';

const withResiduals = (caveat: string): string => `${caveat} ${SHARED_RESIDUALS}`;

export const alternativePairsSettle: readonly TPricePair[] = [
    {
        id: 'alt.settle.pull-at-the-getter-vs-push-at-the-write.depth-1',
        path: EPricePath.PerFrame,
        ours: 'write 300 roots, then read 200 computeds that walk their 3 sources — chain depth 1',
        floor: 'the same writes, each marking its dependents dirty; each read is one boolean — depth 1',
        caveat: withResiduals(
            'THE ROW THE RECOVERED RUN ACTUALLY COVERED, REBUILT SO THE OTHER TWO HAVE SOMETHING TO ' +
            'BE READ AGAINST. Its figure at this geometry was 0.72x in our favour ' +
            '[NO RUN BEHIND THIS FIGURE], and the whole reason the other two rows exist is that ' +
            'this one was the ONLY depth measured. At depth 1 push is at its strongest: a consumer ' +
            'is one boolean away from knowing it owes a derivation, and the sources under it are ' +
            'roots, which are current by definition — so the arm has nothing to descend and nothing ' +
            'to bring up to date. If the recovered figure is going to reproduce anywhere it is ' +
            'here, and a reading far from it on this row means the two runs are not measuring the ' +
            'same thing and the other two rows should not be quoted either ' +
            '[FIGURE STATED IN ADVANCE].',
        ),
        build: () => buildDepth(1),
    },

    {
        id: 'alt.settle.pull-at-the-getter-vs-push-at-the-write.depth-2',
        path: EPricePath.PerFrame,
        ours: 'the same frame over a computed reading a computed — chain depth 2',
        floor: 'the same frame, marked at the write and descended by the flag — chain depth 2',
        caveat: withResiduals(
            'THE FIRST DEPTH THE RECOVERED RUN NEVER REACHED, AND THE ONE WHERE PUSH STARTS PAYING ' +
            'TWICE. A write now marks 200 nodes at level one and 200 more above them, and the walk ' +
            'is recursive; our arm\'s write is unchanged — it stamps a root and stops — while its ' +
            'READ grows by one level. So the two curves cross somewhere if they cross at all, and ' +
            'this row and the next are what say whether they do. WHAT DOES NOT CHANGE BETWEEN THE ' +
            'ROWS: the population, the fan-in, the number of consumers, the writes per frame and ' +
            'the derive body. Only the number of levels between the roots and the consumers moves, ' +
            'so this row minus the depth-1 row is one level, on both arms, in one process. IF THE ' +
            'RATIO RISES TOWARD 1.00 AS DEPTH GROWS THE VERDICT IS NARROWER THAN THE RECOVERED ' +
            'TABLE CLAIMED [FIGURE STATED IN ADVANCE], and if it crosses 1.00 the decision is ' +
            'wrong for deep chains and that is the finding this file was built to be able to ' +
            'report.',
        ),
        build: () => buildDepth(2),
    },

    {
        id: 'alt.settle.pull-at-the-getter-vs-push-at-the-write.depth-3',
        path: EPricePath.PerFrame,
        ours: 'the same frame over a computed reading a computed reading a computed — chain depth 3',
        floor: 'the same frame, marked at the write through three levels — chain depth 3',
        caveat: withResiduals(
            'THE DEPTH THE RECOVERY ENTRY NAMES BY HAND — "a computed over a computed over a ' +
            'computed was not measured" — and the far end of the only axis that could reverse the ' +
            'decision. 600 nodes now stand between 300 roots and 200 consumers. THE ARITHMETIC THE ' +
            'ROW IS CHECKING: push pays its marking over the whole cone at every frame\'s first ' +
            'write and then reads one boolean per node; we pay nothing at the write and one ' +
            'comparison per source at the read. Those are the same order of magnitude, so which ' +
            'wins is a question about constants and not about shapes, which is exactly the kind of ' +
            'question a measurement settles and an operation count does not. THIS IS THE ROW TO ' +
            'DISTRUST IF ANY: three levels of 200 nodes is deeper than most screens go, and a ' +
            'reader taking a verdict from here alone has chosen the extreme of the axis. Read the ' +
            'three rows as a table.',
        ),
        build: () => buildDepth(3),
    },
];
