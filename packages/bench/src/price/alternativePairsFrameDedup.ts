// Prose: ./README.md#alternativepairsframededup
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';

/**
 * A LEAF, WITH THE ONE FIELD UNDER DECISION AND ONE THE FRAME WRITES.
 *
 * BOTH ARMS ALLOCATE THIS SHAPE and the `Set` arm never reads `stampedInFrame`.
 * Two shapes would be two hidden classes reaching the two bodies, which is a
 * difference this instrument introduced rather than one either design has.
 */
type TDedupLeaf = {
    /** The frame-number arm's dedup, and the whole of it. */
    stampedInFrame: number;
    /** What the frame's walk leaves behind, so the walk cannot be deleted. */
    runs: number;
};

/**
 * THE FRAME NUMBER AS AN OBJECT FIELD, one load off the frame the channel holds:
 * a local variable would give this arm a register where a frame-stamping engine
 * has a memory load.
 */
type TDedupFrame = { number: number };

/** The recovered geometry: 200 consumers over 300 roots. */
const LEAVES = 200;
const ROOTS = 300;

const arrivalsOf = (fanIn: number): { leaves: TDedupLeaf[]; arrivals: TDedupLeaf[] } => {
    const leaves: TDedupLeaf[] = [];
    for (let i = 0; i < LEAVES; i++) leaves.push({ stampedInFrame: -1, runs: 0 });
    const byRoot: TDedupLeaf[][] = [];
    for (let i = 0; i < ROOTS; i++) byRoot.push([]);
    for (let j = 0; j < LEAVES; j++) {
        for (let k = 0; k < fanIn; k++) byRoot[(j * fanIn + k) % ROOTS].push(leaves[j]);
    }
    const arrivals: TDedupLeaf[] = [];
    for (let i = 0; i < ROOTS; i++) {
        for (let k = 0; k < byRoot[i].length; k++) arrivals.push(byRoot[i][k]);
    }
    return { leaves, arrivals };
};

const buildDedup = (fanIn: number) => {
    const ourWorld = arrivalsOf(fanIn);
    const floorWorld = arrivalsOf(fanIn);
    /**
     * THE FRAME CLOCK, THE LIST AND THE ARRIVAL CURSOR LIVE ACROSS PASSES, and
     * that is a correctness requirement rather than a saving. A frame number
     * restarted at 0 by every timed pass would eventually collide with a stamp
     * a PREVIOUS pass left on a leaf — the leaf would read as already listed,
     * be skipped, and the two arms would stop doing the same work. The whole
     * point of a stamp is that it is never reset, and a fixture that resets it
     * is not the mechanism.
     */
    const ourList: TDedupLeaf[] = [];
    const ourFrame: TDedupFrame = { number: 0 };
    let ourAt = 0;
    const floorList = new Set<TDedupLeaf>();
    let floorAt = 0;
    return {
        ours: {
            reset: () => undefined,
            run: (times: number): void => {
                const arrivals = ourWorld.arrivals;
                const listed = ourList;
                const frame = ourFrame;
                let at = ourAt;
                let sunk = 0;
                for (let i = 0; i < times; i++) {
                    // A frame-number dedup of effects; `OIMChannel.addEffectScheduledToRun` dedups on
                    // the `isRunScheduled` flag instead (`packages/core/src/engine/channel/OIMChannel.ts:26-30`).
                    const leaf = arrivals[at];
                    if (leaf.stampedInFrame !== frame.number) {
                        leaf.stampedInFrame = frame.number;
                        listed.push(leaf);
                    }
                    if (++at === arrivals.length) {
                        at = 0;
                        // The frame: one pass over one array, then the array is
                        // emptied — `runFrame`'s own two lines
                        // (`packages/core/src/engine/channel/OIMChannel.ts`).
                        for (let n = 0; n < listed.length; n++) sunk += ++listed[n].runs;
                        listed.length = 0;
                        frame.number++;
                    }
                }
                ourAt = at;
                priceSink.number = sunk;
            },
        },
        floor: {
            reset: () => undefined,
            run: (times: number): void => {
                const arrivals = floorWorld.arrivals;
                // THE SET IS THE LIST. Containment is the dedup, so this design
                // keeps no frame number at all — counted in its favour by simply
                // not existing here.
                const listed = floorList;
                let at = floorAt;
                let sunk = 0;
                for (let i = 0; i < times; i++) {
                    listed.add(arrivals[at]);
                    if (++at === arrivals.length) {
                        at = 0;
                        for (const leaf of listed) sunk += ++leaf.runs;
                        listed.clear();
                    }
                }
                floorAt = at;
                priceSink.number = sunk;
            },
        },
    };
};

/**
 * WHAT EVERY ROW IN THIS FILE SHARES. One text, appended, because three copies
 * of a paragraph are three things that can drift apart.
 */
const SHARED_RESIDUALS =
    'RESIDUALS. WHAT THE `Set` BUYS, and it is not nothing: dedup and containment are ONE ' +
    'operation, there is no per-leaf word to keep in step, and the invariant the stamp design ' +
    'holds by hand — a leaf is on the frame\'s list iff its stamp says so — cannot be broken, so ' +
    'that arm cannot list a leaf twice or lose one. The stamp buys back two things the `Set` ' +
    'cannot: it is a FRAME NUMBER, so it is stale again at the next frame with nobody clearing ' +
    'it, and it is also the DETACH — a leaf let go of between the write that listed it and the ' +
    'flush is unlisted by writing the same field, and the frame\'s pass reads it again before ' +
    'calling. A `Set` design needs a second mechanism for that and this arm is not charged for ' +
    'one. WHAT THE ENGINE DOES TODAY IS NEITHER ARM AS PRICED: `TOIMEffect.isRunScheduled` is a ' +
    'BOOLEAN, which the frame\'s pass clears as it consumes a leaf and `detach` writes false — ' +
    'the same compare and store, so the operation count here stands, and the self-staling ' +
    'property this arm is credited with is one the boolean does not have. The row is a reading ' +
    'of the frame-number arm and owes a run against the boolean [NO RUN BEHIND THIS FIGURE]. ' +
    'AGAINST US: our arm carries a frame number and pays a ' +
    'compare and a store the `Set` arm does not, because the stamp is doing the queue\'s dedup as ' +
    'well as its own. AGAINST THE `Set` ARM: its `clear()` is proportional to what it held where ' +
    'our `length = 0` is not, and both are inside the operation count here rather than hidden ' +
    'outside it. WHAT NEITHER ARM PAYS: the write that produced the arrival and the walk of ' +
    '`slot.effects` that carried it, which are `OIMChannel.write`\'s and identical on both sides.';

const withResiduals = (caveat: string): string => `${caveat} ${SHARED_RESIDUALS}`;

export const alternativePairsFrameDedup: readonly TPricePair[] = [
    {
        id: 'alt.frame-dedup.stamp-vs-set.fan-in-1',
        path: EPricePath.PerRowPerWrite,
        ours: 'compare the leaf\'s frame stamp, write it, push onto the frame array — no arrival is a repeat',
        floor: 'add the leaf to the frame\'s Set, which dedups by containment — no arrival is a repeat',
        caveat: withResiduals(
            'THE ROW WITH NOTHING TO DEDUPLICATE, AND IT IS HERE BECAUSE IT IS THE ONE THE STAMP ' +
            'SHOULD WIN LEAST. Every leaf reads one root, so all 200 arrivals of a frame are first ' +
            'arrivals: our stamp never takes its early return and the `Set` never probes an entry ' +
            'it already holds. What is left in the difference is a field compare plus a field store ' +
            'plus an array push against one hash insert, with no repeat path exercised on either ' +
            'side. A reader who wants to know what the stamp is worth when the graph is a tree — ' +
            'one consumer per root, which is what most screens are — reads this row and not the ' +
            'other two. It is also the row that says whether the recovered figures can be quoted ' +
            'at all: if the stamp does not lead here, the mechanism is not what the quoted ' +
            'per-arrival numbers were describing.',
        ),
        build: () => buildDedup(1),
    },

    {
        id: 'alt.frame-dedup.stamp-vs-set.fan-in-3',
        path: EPricePath.PerRowPerWrite,
        ours: 'the same three lines, at fan-in 3 — two arrivals in three are repeats',
        floor: 'the same Set, at fan-in 3 — two arrivals in three are repeats',
        caveat: withResiduals(
            'THE GEOMETRY THE QUOTED FIGURES WERE TAKEN AT — 200 consumers, fan-in 3, 300 roots — ' +
            'and the row that answers whether 0.95 ns against 5.24 ns, a factor of 5.5x, is what ' +
            'this mechanism costs [NO RUN BEHIND THIS FIGURE]. ONE THING ABOUT THE MIX IS NOT THE ' +
            'SAME AND IS SAID RATHER THAN LEFT TO BE FOUND: the quoted run reported 370 arrivals ' +
            'per frame of which 182 were deduplicated, and this row writes EVERY root, so a frame ' +
            'here is 600 arrivals of which 400 are repeats [NO RUN BEHIND THIS FIGURE]. The unit ' +
            'is per arrival on both, which is what makes them comparable at all; the repeat ' +
            'FRACTION is higher here, and since a repeat is where the stamp is strongest, this row ' +
            'should read at least as favourably as the quoted one and a reading below it is the ' +
            'interesting outcome [FIGURE STATED IN ADVANCE].',
        ),
        build: () => buildDedup(3),
    },

    {
        id: 'alt.frame-dedup.stamp-vs-set.fan-in-8',
        path: EPricePath.PerRowPerWrite,
        ours: 'the same three lines, at fan-in 8 — seven arrivals in eight are repeats',
        floor: 'the same Set, at fan-in 8 — seven arrivals in eight are repeats',
        caveat: withResiduals(
            'THE WIDE END, WHERE ALMOST EVERY ARRIVAL IS A REPEAT AND THE TWO DESIGNS ARE FURTHEST ' +
            'APART PER ARRIVAL. A leaf reading eight roots is an ordinary derived view — a total ' +
            'over a group, a row joined from several records — and a frame that touches all of ' +
            'them offers it eight times. Our arm answers seven of those eight with one field ' +
            'compare and a branch; the `Set` answers each with a hash of the object identity and a ' +
            'bucket probe. THIS IS THE ROW TO DISTRUST IF ANY, and in the direction that flatters ' +
            'us: the frame\'s own walk and its teardown are shared by both arms and are amortised ' +
            'over 1600 arrivals here against 200 at fan-in 1, so the shared constant is at its ' +
            'smallest exactly where our margin is at its largest. Read the three rows as a table ' +
            'and the trend across them rather than any one of them as the price.',
        ),
        build: () => buildDedup(8),
    },
];
