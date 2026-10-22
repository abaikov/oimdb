import { createOIMEntityWriterInPlace } from '../../../core/src/index';
import type { IOIMEntityWriter, TOIMEntitySlot } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceFixture } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

/** The population every row here is measured over. */
const ROWS = 1024;

/**
 * ONE MORE LINK, AND IT DOES NOTHING BUT FORWARD.
 *
 * A class rather than an object literal because that is what a consumer's layer
 * is — `OIMSlotContentEntityService` is one — and because the shape at the
 * delegating call site is half of what these rows measure.
 */
class PassThroughLink implements IOIMEntityWriter {




    public constructor(private readonly inner: IOIMEntityWriter) {}

    public readonly fillEntity = (slot: TOIMEntitySlot, item: object): void => {
        this.inner.fillEntity(slot, item);
    };

    public readonly putEntity = (
        slot: TOIMEntitySlot, item: object, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.putEntity(slot, item, changedColumnNames);

    public readonly patchEntity = (
        slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.patchEntity(slot, patch, changedColumnNames);

    public readonly patchColumn = (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.patchColumn(slot, columnName, value, changedColumnNames);


    public readonly deleteColumns = (
        slot: TOIMEntitySlot,
        names: readonly string[],
    ): readonly string[] => this.inner.deleteColumns(slot, names);

    public readonly clearEntity = (slot: TOIMEntitySlot): void => {
        this.inner.clearEntity(slot);
    };
}

/**
 * A SIDE THAT IS NEVER TIMED, so an isolated pair's return stays whole without
 * constructing the chain being kept out of this process.
 */
const inertSide: TPriceSide = { reset: () => undefined, run: () => undefined };

/**
 * The chain under test, built from the shipped parts. `depth` counts the links
 * BELOW `OIMSlotContentEntityService`, so 1 is what ships today.
 */
const chainOf = (depth: number): IOIMEntityWriter => {
    let service: IOIMEntityWriter = createOIMEntityWriterInPlace();
    for (let i = 1; i < depth; i++) service = new PassThroughLink(service);
    return service;
};

/**
 * One pass writes `title` on every row of the population and closes the frame.
 * The value alternates with the flag, so no write is ever a re-send.
 */
const sideOfDepth = (depth: number): TPriceSide => {
    const world = priceFixture(ROWS, chainOf(depth));
    const patch: { title: string } = { title: '' };
    let flip = false;
    return {
        reset: () => undefined,
        run: times => {
            const slotContentService = world.entityService.slotContentService;
            const slots = world.slots;
            const db = world.db;
            let done = 0;
            while (done < times) {
                const upTo = Math.min(slots.length, times - done);
                flip = !flip;
                patch.title = flip ? 'a' : 'b';
                for (let i = 0; i < upTo; i++) {
                    slotContentService.updateEntity(slots[i], patch as Partial<TPriceDataRow>);
                }
                db.flush();
                done += upTo;
            }
            priceSink.ours = world.slots[0];
        },
    };
};

/**
 * THE OTHER WAY TO SPELL A CHAIN: the continuation arrives as an ARGUMENT
 * instead of being held in a field.
 *
 * One dispatcher stands where a link stood. Its doors walk an array of stages
 * and hand each one the continuation it should call, so a stage never names
 * what is under it. That is the shape a `next(…)` middleware has, and the cost
 * it carries over the field-bound form is the closure the continuation has to
 * be — a stage cannot be handed `this.inner` because it does not have one.
 *
 * ONE STAGE, so the row is comparable to `chain.three-links-vs-the-shipped-two`
 * operation for operation: both put exactly one forwarding step between
 * `OIMSlotContentEntityService` and `createOIMEntityWriterInPlace`.
 */
type TStage = {
    readonly fill: (slot: TOIMEntitySlot, item: object, next: TFillNext) => void;
    readonly mutate: (
        slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined, next: TMutateNext,
    ) => boolean;
    readonly remove: (
        slot: TOIMEntitySlot,
        names: readonly string[],
        next: TRemoveNext,
    ) => readonly string[];
    readonly clear: (slot: TOIMEntitySlot, next: TClearNext) => void;
};
type TFillNext = (slot: TOIMEntitySlot, item: object) => void;
type TMutateNext = (slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined) => boolean;
type TRemoveNext = (slot: TOIMEntitySlot, names: readonly string[]) => readonly string[];
type TClearNext = (slot: TOIMEntitySlot) => void;

/** A stage that only forwards — the same nothing `PassThroughLink` does. */
const forwardingStage: TStage = {
    fill: (slot, item, next) => { next(slot, item); },
    mutate: (slot, patch, changedColumnNames, next) => next(slot, patch, changedColumnNames),
    remove: (slot, names, next) => next(slot, names),
    clear: (slot, next) => { next(slot); },
};

class NextParameterChain implements IOIMEntityWriter {




    public constructor(
        private readonly stages: readonly TStage[],
        private readonly last: IOIMEntityWriter,
    ) {}

    public readonly fillEntity = (slot: TOIMEntitySlot, item: object): void => {
        this.fillFrom(0, slot, item);
    };

    public readonly putEntity = (
        slot: TOIMEntitySlot, item: object, changedColumnNames: string[] | undefined,
    ): boolean => this.last.putEntity(slot, item, changedColumnNames);

    public readonly patchEntity = (
        slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined,
    ): boolean => this.mutateFrom(0, slot, patch, changedColumnNames);

    public readonly patchColumn = (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ): boolean => this.last.patchColumn(slot, columnName, value, changedColumnNames);


    public readonly deleteColumns = (
        slot: TOIMEntitySlot,
        names: readonly string[],
    ): readonly string[] => this.removeFrom(0, slot, names);

    public readonly clearEntity = (slot: TOIMEntitySlot): void => {
        this.clearFrom(0, slot);
    };

    private fillFrom(at: number, slot: TOIMEntitySlot, item: object): void {
        if (at === this.stages.length) { this.last.fillEntity(slot, item); return; }
        this.stages[at].fill(slot, item, (s, i) => { this.fillFrom(at + 1, s, i); });
    }

    private mutateFrom(
        at: number, slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined,
    ): boolean {
        if (at === this.stages.length) return this.last.patchEntity(slot, patch, changedColumnNames);
        return this.stages[at].mutate(
            slot, patch, changedColumnNames, (s, p, names) => this.mutateFrom(at + 1, s, p, names),
        );
    }

    private removeFrom(
        at: number,
        slot: TOIMEntitySlot,
        names: readonly string[],
    ): readonly string[] {
        if (at === this.stages.length) return this.last.deleteColumns(slot, names);
        return this.stages[at].remove(slot, names, (s, n) => this.removeFrom(at + 1, s, n));
    }

    private clearFrom(at: number, slot: TOIMEntitySlot): void {
        if (at === this.stages.length) { this.last.clearEntity(slot); return; }
        this.stages[at].clear(slot, s => { this.clearFrom(at + 1, s); });
    }
}

/**
 * THREE LINK CLASSES WITH IDENTICAL BODIES, so a process can be given more than
 * one shape at `this.inner.patchEntity` without changing what any write does.
 * Declared rather than generated: a factory would hand back one class three
 * times, which is the arm this is measured against.
 */
class LinkB implements IOIMEntityWriter {




    public constructor(private readonly inner: IOIMEntityWriter) {}
    public readonly fillEntity = (slot: TOIMEntitySlot, item: object): void => {
        this.inner.fillEntity(slot, item);
    };
    public readonly putEntity = (
        slot: TOIMEntitySlot, item: object, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.putEntity(slot, item, changedColumnNames);
    public readonly patchEntity = (
        slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.patchEntity(slot, patch, changedColumnNames);
    public readonly patchColumn = (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.patchColumn(slot, columnName, value, changedColumnNames);
    public readonly deleteColumns = (
        slot: TOIMEntitySlot,
        names: readonly string[],
    ): readonly string[] => this.inner.deleteColumns(slot, names);
    public readonly clearEntity = (slot: TOIMEntitySlot): void => { this.inner.clearEntity(slot); };
}

class LinkC implements IOIMEntityWriter {




    public constructor(private readonly inner: IOIMEntityWriter) {}
    public readonly fillEntity = (slot: TOIMEntitySlot, item: object): void => {
        this.inner.fillEntity(slot, item);
    };
    public readonly putEntity = (
        slot: TOIMEntitySlot, item: object, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.putEntity(slot, item, changedColumnNames);
    public readonly patchEntity = (
        slot: TOIMEntitySlot, patch: object, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.patchEntity(slot, patch, changedColumnNames);
    public readonly patchColumn = (
        slot: TOIMEntitySlot, columnName: string, value: unknown, changedColumnNames: string[] | undefined,
    ): boolean => this.inner.patchColumn(slot, columnName, value, changedColumnNames);
    public readonly deleteColumns = (
        slot: TOIMEntitySlot,
        names: readonly string[],
    ): readonly string[] => this.inner.deleteColumns(slot, names);
    public readonly clearEntity = (slot: TOIMEntitySlot): void => { this.inner.clearEntity(slot); };
}

/** A side driven through a write service the caller names. */
const sideOfService = (write: IOIMEntityWriter): TPriceSide => {
    const world = priceFixture(ROWS, write);
    const patch: { title: string } = { title: '' };
    let flip = false;
    return {
        reset: () => undefined,
        run: times => {
            const slotContentService = world.entityService.slotContentService;
            const slots = world.slots;
            const db = world.db;
            let done = 0;
            while (done < times) {
                const upTo = Math.min(slots.length, times - done);
                flip = !flip;
                patch.title = flip ? 'a' : 'b';
                for (let i = 0; i < upTo; i++) {
                    slotContentService.updateEntity(slots[i], patch as Partial<TPriceDataRow>);
                }
                db.flush();
                done += upTo;
            }
            priceSink.ours = world.slots[0];
        },
    };
};

/**
 * THREE POPULATIONS IN ONE PROCESS, written round-robin — the arrangement that
 * makes the delegating site polymorphic when the three links are three classes
 * and monomorphic when they are one.
 *
 * ONE ROUND IS ONE PASS OVER EACH WORLD, so a round performs `worlds.length`
 * operations for every row it writes and the rows it asks for are the operations
 * left DIVIDED by that. Taking the row count from the whole remainder and then
 * charging it multiplied is what ran a pass past the count the reading divides
 * by; see the dated note on the row.
 */
const sideOfThreeWorlds = (makeLink: readonly ((inner: IOIMEntityWriter) => IOIMEntityWriter)[]): TPriceSide => {
    const worlds = makeLink.map(wrap => priceFixture(ROWS, wrap(createOIMEntityWriterInPlace())));
    const patch: { title: string } = { title: '' };
    let flip = false;
    return {
        reset: () => undefined,
        run: times => {
            let done = 0;
            while (done < times) {
                const perWorld = Math.min(ROWS, Math.ceil((times - done) / worlds.length));
                flip = !flip;
                patch.title = flip ? 'a' : 'b';
                for (let w = 0; w < worlds.length; w++) {
                    const world = worlds[w];
                    // Hoisted as the two drivers above hoist them: a property
                    // load left in this loop is work per write that the rows
                    // this one is read against do not pay.
                    const slotContentService = world.entityService.slotContentService;
                    const slots = world.slots;
                    for (let i = 0; i < perWorld; i++) {
                        slotContentService.updateEntity(slots[i], patch as Partial<TPriceDataRow>);
                    }
                    world.db.flush();
                }
                done += perWorld * worlds.length;
            }
            priceSink.ours = worlds[0].slots[0];
        },
    };
};

/** What both caveats say about what is inside both numbers. */
const THE_WRITE_AROUND_THE_LINK =
    'THE WRITE AROUND THE LINK IS IDENTICAL ON BOTH ARMS AND IS INSIDE BOTH NUMBERS: ' +
    '`assertNotFlushing`, the isOnFastPath read, the column walk over a ' +
    'ONE-COLUMN patch, the equality call, the store into `slot.entity`, the report to the ' +
    'channel, releaseWrittenSlotIfUnheld and the frame that closes the pass. ONE OPERATION IS ONE `updateEntity` OF ONE COLUMN ' +
    `OF ONE ROW, over a population of ${ROWS}, with a frame per pass over the population — so ` +
    `the frame is one part in ${ROWS} of the row. The link is touched ONCE per operation: ` +
    '`updateEntity` reaches `patchEntity` and no other door. A row that removed a column would touch ' +
    'it twice and is not measured here.';

export const pricePairsChainDepth: readonly TPricePair[] = [
    {
        id: 'chain.three-links-vs-the-shipped-two',
        path: EPricePath.PerWrite,
        ours: 'entityService.updateEntity → the entity content internal service → a forwarding link → createOIMEntityWriterInPlace',
        floor: 'the same updateEntity through the shipped chain: entityService → the entity content internal service → createOIMEntityWriterInPlace',
        caveat:
            'WHAT ONE LINK COSTS, AND THE ROW A TTL LAYER WOULD BE BUILT ON. The added link ' +
            'forwards `patchEntity` and returns what came back, so the difference between the two ' +
            'numbers is one field load, one arrow-property load and one call — per write. ' +
            'PREDICTED OPERATION COUNT: one extra frame of three machine operations against a ' +
            `write that already does sixteen or more, over ${ROWS} rows per pass. ` +
            'WHICH WAY THE UNMEASURED DIFFERENCE PUSHES: against the deep arm, and only that ' +
            'way. The forwarding link cannot make any part of the write cheaper, so a reading ' +
            'AT OR BELOW 1.00 IS THE INSTRUMENT AND NOT THE DESIGN [FIGURE STATED IN ADVANCE]. ' +
            'WHAT IS NOT PRICED HERE: the shape cost. Both arms are isolated, so each runs with ' +
            'ONE shape at the delegating site; a process that mixes link types pays a ' +
            'polymorphic site on top of what this row reads, and no row in this suite measures ' +
            `that yet. ${THE_WRITE_AROUND_THE_LINK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : sideOfDepth(2),
            floor: wanted === 'ours' ? inertSide : sideOfDepth(1),
        }),
    },

    {
        id: 'chain.four-links-vs-the-shipped-two',
        path: EPricePath.PerWrite,
        ours: 'entityService.updateEntity → the entity content internal service → two forwarding links → createOIMEntityWriterInPlace',
        floor: 'the same updateEntity through the shipped chain: entityService → the entity content internal service → createOIMEntityWriterInPlace',
        caveat:
            'THE SECOND POINT OF THE CURVE, AND THE ONLY THING THAT SAYS WHETHER A LINK HAS A ' +
            'FLAT PRICE. Read against the row above it: if two links cost twice what one link ' +
            'costs, a chain is a straight line and a consumer can budget by counting links. If ' +
            'the second link costs more than the first, the site has stopped being inlined and ' +
            'the row above under-reads every deeper chain [FIGURE STATED IN ADVANCE]. ' +
            'A SINGLE ROW HERE ANSWERS NOTHING; the pair of rows is the measurement. ' +
            `${THE_WRITE_AROUND_THE_LINK}`,
        isolate: true,
        build: wanted => ({
            ours: wanted === 'floor' ? inertSide : sideOfDepth(3),
            floor: wanted === 'ours' ? inertSide : sideOfDepth(1),
        }),
    },

    {
        id: 'chain.next-as-a-parameter-vs-next-held-in-a-field',
        path: EPricePath.PerWrite,
        ours: 'one forwarding stage reached through a stages array, handed its continuation',
        floor: 'one forwarding link holding its continuation in a field — the shipped construction',
        caveat:
            'THE TWO WAYS TO SPELL A CHAIN, WITH EXACTLY ONE STAGE IN EACH so the comparison is ' +
            'about the SPELLING and not about depth. Both arms put one forwarding step between ' +
            '`OIMSlotContentEntityService` and `createOIMEntityWriterInPlace`, and that step does nothing but pass ' +
            'the call on. THE DIFFERENCE, and it is the whole row: the field-bound arm reads ' +
            '`this.inner` and calls a method on it; the parameter arm ALLOCATES THE CONTINUATION ' +
            '— a closure over the stage index and the receiver — and hands it in, on every write. ' +
            'PREDICTED OPERATION COUNT per write: the field arm pays two property loads and a ' +
            'call; the parameter arm pays a closure allocation, an array load, a property load ' +
            'and two calls. WHICH WAY THE UNMEASURED DIFFERENCE PUSHES: against the parameter ' +
            'arm, and only that way — it does everything the field arm does and allocates on top ' +
            '[FIGURE STATED IN ADVANCE]. WHAT THE PARAMETER FORM BUYS, which no number here ' +
            'prices: a stage that never names what is under it, so an order can be composed at ' +
            `run time. A reader deciding between the two owes that against whatever this costs. ${THE_WRITE_AROUND_THE_LINK}`,
        isolate: true,
        build: wanted => ({
            ours:
                wanted === 'floor'
                    ? inertSide
                    : sideOfService(new NextParameterChain([forwardingStage], createOIMEntityWriterInPlace())),
            floor: wanted === 'ours' ? inertSide : sideOfService(new PassThroughLink(createOIMEntityWriterInPlace())),
        }),
    },

    {
        id: 'chain.three-link-classes-in-one-process-vs-one-class-three-times',
        path: EPricePath.PerWrite,
        ours: 'three entity services, each with a DIFFERENT forwarding class — the site sees three shapes',
        floor: 'three entity services with the SAME forwarding class — the site sees one shape',
        caveat:
            'THE COST NO OTHER ROW IN THIS FILE PRICES, AND THE ONE THAT DECIDES THE SHAPE OF A ' +
            'LAYER API. Every other row here declares `isolate` so each arm runs with ONE shape ' +
            'at `OIMSlotContentEntityService`\'s `this.entityWriter.patchEntity`; this row is what those ' +
            'rows deliberately keep out. Both arms write the same number of rows through the same ' +
            'depth over three populations round-robin, and DIFFER ONLY IN HOW MANY CLASSES stand ' +
            'at that one call site: three, or one constructed three times. The three classes have ' +
            'IDENTICAL BODIES — they are written out separately rather than generated, because a ' +
            'factory hands back one class and that is the other arm. ' +
            'WHAT IT DECIDES: whether a consumer may freely mix layer types, or whether a layer ' +
            'API should be one class parameterised by a callback. If this row is flat, the ' +
            'question is answered and nothing follows from it; if it is not, then every count in ' +
            'the rows above is a floor rather than the price ' +
            '[FIGURE STATED IN ADVANCE]. ' +
            'WHICH WAY THE UNMEASURED DIFFERENCE PUSHES: against the many-classes arm and only ' +
            'that way — three shapes at a site cannot make it faster than one. ' +
            'WHY THREE AND NOT FIVE: three is inside V8\'s polymorphic range, so the row reads ' +
            'what a POLYMORPHIC site costs against a monomorphic one. What a MEGAMORPHIC site ' +
            'costs is a different row and this suite does not have it. ' +
            'OPERATION COUNT, AND IT IS NOT THE GEOMETRY THE SHARED PARAGRAPH BELOW DESCRIBES: ' +
            'this row runs THREE populations of 1024 and not one. One operation is one `updateEntity` ' +
            'of one column of one row and the link is touched once per operation, as below; what ' +
            'differs is the round. One round writes the same rows in each of the three worlds and ' +
            'closes a frame in each, so a full round is 3072 updates and 3 frames, and the count a ' +
            'pass consumes moves in steps of 3072 rather than of 1024. BOTH ARMS RUN THAT ONE ' +
            'DRIVER OVER THREE WORLDS, so at an equal operation count they perform an equal number ' +
            'of updates and an equal number of frames: nothing about how much work a pass does ' +
            'differs between the arms, only which classes stand at the delegating site. ' +
            'THE DRIVER CHANGED AND THE ID DID NOT, so a reading recorded under this id in ' +
            '`measurements/2026-09-07-price/chain-depth` and one taken now are not comparable and ' +
            'may not be put in one column. What the driver it replaced did: it took the rows per ' +
            'world from the WHOLE remaining count and then ' +
            'charged that count multiplied by the three worlds, so a pass performed up to 2048 ' +
            'updates more than the number the reading is divided by, and each arm was inflated by ' +
            'its own remainder. In that stored run that is 402432 ' +
            'updates performed against 400514 charged on our side and 626688 against 625872 on the ' +
            'floor, which moves that stored ratio by less than one part in two hundred. THE ' +
            'OVERSHOOT WAS A FALSE COUNT, IT IS GONE, AND IT WAS NOT WHAT AILS THIS ROW. ' +
            'WHAT DOES, AND IT IS NOT THE DRIVER BUT THE DIVISOR: in ' +
            'measurements/2026-09-07-price/chain-depth the floor of this row is timed at 64.13 ns ' +
            'and again at 44.75 ns, 43.3% apart, and the quotient takes the FIRST of the two while ' +
            'the second was equally entitled to it. The same 59.81 ns of ours in ' +
            'measurements/2026-09-07-price/chain-depth over the other floor reading is 1.34x ' +
            'rather than the 0.93x stored, and the three sibling rows of that same run read their ' +
            'floor at 43.81, 44.36 and 44.52 ns, so the 64.13 is one bad process. Three later ' +
            're-runs of this row came out at 1.41, 1.31 and 1.38 and none of them was recorded, ' +
            'so they are quoted here as a direction only [NO RUN BEHIND THIS FIGURE]. ' +
            'The printer now prints `void` for a ratio whose side disagreed with itself past the ' +
            'bar and gives that row no place in the ranking, so this row states a price again only ' +
            'when a run has it under the bar. WHAT IS STILL UNFOUND is why one process of this ' +
            'body was half again as slow as the four others that timed it, and no claim about ' +
            'mixing link classes may be quoted from this row until that is answered. ' +
            'A SECOND DIFFERENCE BETWEEN THE ARMS, WHICH THE DIRECTION STATED ABOVE DOES NOT ' +
            'COVER. The many-classes arm has THREE forwarding bodies, each holding one ' +
            '`createOIMEntityWriterInPlace` and therefore seeing one receiver at its own `this.inner.patchEntity`; ' +
            'the one-class arm has ONE forwarding body seeing the three `createOIMEntityWriterInPlace` objects of ' +
            'the three worlds. The arms therefore differ at the link\'s own delegating site as ' +
            'well as at the content internal service\'s, and in the opposite order. "Only that way" is stated of ' +
            'the site this row names and is not established for the row as a whole; what the ' +
            `second site costs is not measured here and no row in this suite measures it. ${THE_WRITE_AROUND_THE_LINK}`,
        isolate: true,
        build: wanted => ({
            ours:
                wanted === 'floor'
                    ? inertSide
                    : sideOfThreeWorlds([
                        inner => new PassThroughLink(inner),
                        inner => new LinkB(inner),
                        inner => new LinkC(inner),
                    ]),
            floor:
                wanted === 'ours'
                    ? inertSide
                    : sideOfThreeWorlds([
                        inner => new PassThroughLink(inner),
                        inner => new PassThroughLink(inner),
                        inner => new PassThroughLink(inner),
                    ]),
        }),
    },
];
