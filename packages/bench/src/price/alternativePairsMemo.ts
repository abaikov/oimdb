// Prose: ./README.md#alternativepairsmemo
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

/** A list under a derivation — the slot a write stamps, and the rows it walks. */
type TListRoot = TOIMSlot & { rows: number[] };

const ROWS_PER_LIST = 128;
const LISTS = 16;
/** Only rows above this are summed, so the body is a filter and not just a sum. */
const KEPT_ABOVE = 40;

const makeList = (seed: number): TListRoot => {
    const rows: number[] = new Array(ROWS_PER_LIST);
    for (let i = 0; i < ROWS_PER_LIST; i++) rows[i] = (seed * 31 + i * 7) % 100;
    return {
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
        rows,
    };
};

/**
 * THE DEAR BODY: the walk a person reaches for a memo to avoid — a filter and a
 * sum over the whole list.
 *
 * ONE FUNCTION, CALLED BY BOTH ARMS. The arms differ in WHO calls it and how
 * often, which is the whole comparison; giving each its own copy would put two
 * compilations of one loop into a ratio that is supposed to isolate the node.
 */
const walkList = (rows: readonly number[]): number => {
    let sum = 0;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i] > KEPT_ABOVE) sum += rows[i];
    }
    return sum;
};

/** THE CHEAP BODY: one field of one row, which is what `churnChain` derives. */
const readFirst = (rows: readonly number[]): number => rows[0];

type TBody = (rows: readonly number[]) => number;

const memoPair = (bodyName: string, body: TBody, readsPerWrite: number, caveat: string): TPricePair => ({
    id: `alt.memo.node-vs-recompute.${bodyName}-body.${readsPerWrite}-reads-per-write`,
    path: EPricePath.PerRead,
    ours: 'getValueForSlot — a held computed slot of an OIMComputedService store slot over the list slot, derived once per write',
    floor: 'body(list.rows) — the same body, called on every read, no node',
    caveat: `${caveat} ${SHARED_CAVEAT}`,
    build: () => {
        const db = new OIMDB();
        const channelSlot = db.defaultChannelSlot;
        const lists: TListRoot[] = [];
        for (let i = 0; i < LISTS; i++) lists.push(makeList(i));
        const memoComputedService = createOIMComputedService<number, number>({
            computedSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedSlot<number, number>, number>(),
            sameValueGuard: oimSameValueZeroGuard,
            columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
        });
        const memoComputedCollectionService = memoComputedService.computedCollectionService;
        const memoComputedStoreSlot = memoComputedService.createComputedStoreSlot(
            db,
            computedSlot => body(lists[computedSlot.key].rows),
            at => ({ sourceSlots: [lists[at]] }),
        );
        const memoSlots: TOIMComputedSlot<number, number>[] = [];
        for (let i = 0; i < LISTS; i++) memoSlots.push(memoComputedCollectionService.holdSlotByKey(memoComputedStoreSlot, i));
        const computedValueService = memoComputedCollectionService.slotContentService;
        for (let i = 0; i < LISTS; i++) {
            if (computedValueService.getValueForSlot(memoSlots[i]) === body(lists[i].rows)) continue;
            throw new Error(`price: the memo and the recompute disagree on list ${i}.`);
        }
        const listMask = LISTS - 1;
        return {
            ours: {
                reset: () => undefined,
                run: times => {
                    let read = 0;
                    let write = 0;
                    while (read < times) {
                        const at = write++ & listMask;
                        OIMChannelService.INSTANCE.write(channelSlot, lists[at]);
                        const memoSlot = memoSlots[at];
                        for (let r = 0; r < readsPerWrite && read < times; r++, read++) {
                            priceSink.number = computedValueService.getValueForSlot(memoSlot);
                        }
                    }
                },
            },
            floor: {
                reset: () => undefined,
                run: times => {
                    let read = 0;
                    let write = 0;
                    while (read < times) {
                        const list = lists[write++ & listMask];
                        OIMChannelService.INSTANCE.write(channelSlot, list);
                        for (let r = 0; r < readsPerWrite && read < times; r++, read++) {
                            priceSink.number = body(list.rows);
                        }
                    }
                },
            },
        };
    },
});

const SHARED_CAVEAT =
    'BOTH ARMS WRITE THE SAME LIST THROUGH `OIMChannelService.INSTANCE.write` before each run of reads, so the ' +
    'stamp is charged equally and only the reads differ. Ours asks the node, which compares ' +
    'its clock, walks its one source\'s stamp and runs the body once after each write; the ' +
    'floor calls the body on every read. Nothing is subscribed, so no frame runs on either ' +
    'side. The list does not change between writes, so the node\'s guard finds the value ' +
    'equal and keeps it — the cheapest outcome for ours after a derive. The node is a computed ' +
    'slot resolved before the clock, and every read goes through its owner\'s `getValueForSlot`, ' +
    'which pays `assertNotReleased` before the clock compare; its derive finds the list by the ' +
    'slot\'s key, one array index the floor\'s direct `list.rows` does not pay.';

export const alternativePairsMemo: readonly TPricePair[] = [
    memoPair('dear', walkList, 1,
        'THE MEMO WITH NOTHING TO AMORTISE OVER: a filter and a sum over the list, read once per ' +
        'write, so ours derives on every read exactly as the floor does and pays the node on top. ' +
        'Above one is expected; this is the worst cell of the two axes for the shipped design.'),
    memoPair('dear', walkList, 16,
        'THE CASE A MEMO IS FOR: the dear body, sixteen reads between two writes — or sixteen ' +
        'consumers reading once each, which is the same axis. Ours derives once and answers ' +
        'fifteen reads from the node; the floor walks the list sixteen times.'),
    memoPair('cheap', readFirst, 1,
        'THE SHAPE `churnChain` HAS: one field of one row, one read per write. The body is cheaper ' +
        'than the node\'s own bookkeeping, so ours loses by roughly the bookkeeping; no verdict ' +
        'about derivation can be taken from this cell alone.'),
    memoPair('cheap', readFirst, 16,
        'THE CHEAP BODY READ SIXTEEN TIMES: what a memo saves is a field load, and what it costs ' +
        'per read is a clock compare, so the reads-per-write axis alone cannot rescue it here.'),
];
