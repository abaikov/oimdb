import type { TOIMStoreSlot } from '../../../core/src/index';
import { OIMDB, OIMSlotContentSetBucketService, OIMSlotMapStoreService, oimInsertEntityWithSanitizedCopy, createOIMInPlaceEntityWriter } from '../../../core/src/index';
import type {
    TOIMBucketContentSlot,
    TOIMBucketSlotsSetStore,
    TOIMColumnSlot,
    TOIMEntitySlot,
    TOIMEditable,
    TOIMStoreKey,
} from '../../../core/src/index';
import { createOIMEntitySlot } from '../../../core/src/entity/utils/createOIMEntitySlot';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import { createOIMSlotContentEntityService } from '../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../core/src/index';
import { createOIMSingleSlotService } from '../../../core/src/index';

/**
 * THE FIRST LOAD, TAKEN APART — what an inserted row costs, part by part, so a
 * gap against the hand-written floor can be ATTRIBUTED instead of quoted.
 *
 * Each pair puts ONE part of our insert path on one side and the same body
 * WITHOUT that part on the other, so the DIFFERENCE IN NANOSECONDS PER ROW is
 * what the part costs.
 *
 * READ THE ns COLUMNS, NOT THE RATIO, ON EVERY ROW OF THIS FILE. Both arms are
 * usually ours, and a ratio between two arms of one path says nothing a
 * subtraction does not say better. `insert-gap.whole-row-vs-the-baseline-floor`
 * is the one exception: its floor is the other adapter's body, copied.
 *
 * WHAT THE FLOOR ACTUALLY DOES, because assuming it is how a gap gets
 * mis-attributed — `packages/bench/src/adapters/baseline-array.ts`, per
 * row of a batch:
 *
 *     const held = byId.get(row.id);
 *     if (held === undefined) byId.set(row.id, { ...row });
 *
 * The floor PROBES and it ALLOCATES, and our side does both, so NEITHER can be
 * part of the gap — they cancel. Two of the five parts this file was originally
 * asked to price were named on the assumption that the floor did neither.
 *
 * What the floor does NOT do, and what therefore CAN be in the gap: mint an
 * identity, keep a bucket, stamp a clock, mark anybody, walk the stored record's
 * names, or maintain a group index — that last is the `oimdb` adapter's, not the
 * engine's, and is stated in that adapter's own `departure` field.
 */

/** The population every row of this file is loaded with. The scenario's N. */
const ROWS = 10_000;

/** The rows, made once per process: a fixture is not part of any price here. */
const rowsOf = (): TPriceDataRow[] => priceDataset.makeRows(ROWS);

type TRowSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;
type TRowSlotEditable = TOIMEditable<TRowSlot>;

const reportingEntityFixture = () => {
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TPriceDataRow>({ entityWriter: createOIMInPlaceEntityWriter() }), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
    return { entityService, entityStoreSlot: entityService.createStoreSlot(db) };
};

const { slotOwner, ownerEntityStoreSlot } = (() => {
    const { entityService, entityStoreSlot } = reportingEntityFixture();
    return { slotOwner: entityService.getSlotByKey(entityStoreSlot, 'owner').owner, ownerEntityStoreSlot: entityStoreSlot as TOIMStoreSlot };
})();

type TRowBucketSlots = TOIMBucketSlotsSetStore<TRowSlot>;

const holdSingleBucketSlot = (
    db: OIMDB, slotContentService: OIMSlotContentSetBucketService<TRowSlot>,
): TOIMBucketContentSlot<TRowBucketSlots> => {
    const singleBucketService = createOIMSingleSlotService({ slotContentService, columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });
    return singleBucketService.holdSingleSlot(singleBucketService.createStoreSlot(db));
};

const mintSlot = (key: string): TRowSlotEditable =>
    createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(key, slotOwner, ownerEntityStoreSlot);

/**
 * THE INSERT GAP, ONE PART PER ROW.
 *
 * Every row pins `operationsPerPass` to the population size: a pass FILLS an
 * empty world and can do it exactly once, so the count is a fact about the
 * fixture. `reset` rebuilds the empty world outside the clock.
 */
export const pricePairsInsertGap: readonly TPricePair[] = [
    {
        id: 'insert-gap.whole-row-vs-the-baseline-floor',
        path: EPricePath.PerRowPerWrite,
        ours: 'entityService.writeSlotContentByKey(entityStoreSlot, row.id, row) into an empty entity store slot',
        floor: 'const held = byId.get(row.id); if (held === undefined) byId.set(row.id, { ...row })',
        caveat:
            'THE ANCHOR ROW, AND THE ONLY ONE HERE WHOSE RATIO MEANS ANYTHING: the floor is '
            + '`baseline-array.ts`\'s insert copied, so this is the engine half of the scenario gap. '
            + 'IT IS NOT THE WHOLE SCENARIO GAP AND MUST NOT BE READ AS ONE. The `oimdb` adapter '
            + 'keeps its group index inside its own `write`, and `baseline-array` deliberately keeps '
            + 'no index at all. None of that bookkeeping is on either side of this pair. In our '
            + 'favour: our side takes no frame and flushes nothing, so no delivery is timed on '
            + 'either side. Against us: our side mints a fourteen-field slot, opens and closes a '
            + 'change window, stamps the clock and marks the slot on the channel per row, which the '
            + 'floor has no equivalent of.',
        build: () => {
            const rows = rowsOf();
            let { entityService, entityStoreSlot } = reportingEntityFixture();
            let byId = new Map<string, TPriceDataRow>();
            return {
                ours: {
                    reset: () => {
                        ({ entityService, entityStoreSlot } = reportingEntityFixture());
                    },
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) priceSink.ours = entityService.writeSlotContentByKey(entityStoreSlot, rows[i].id, rows[i]);
                    },
                },
                floor: {
                    reset: () => { byId = new Map<string, TPriceDataRow>(); },
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            const held = byId.get(row.id);
                            if (held === undefined) {
                                const stored = { ...row };
                                byId.set(row.id, stored);
                                priceSink.floor = stored;
                            } else priceSink.floor = held;
                        }
                    },
                },
            };
        },
    },
    {
        id: 'insert-gap.the-fourteen-field-slot',
        path: EPricePath.PerRowPerWrite,
        ours: 'createOIMEntitySlot(key, owner) beside the record copy, both filed in a Map',
        floor: 'the record copy alone, filed in a Map',
        caveat:
            'THE ALLOCATION ON ITS OWN, with no engine call around it: both arms are hand-written '
            + 'loops over the same rows into the same kind of `Map`, and the only difference is '
            + 'that ours mints the fourteen-field literal `createOIMEntitySlot` returns and stores '
            + 'the copy on its `entity` field. The copy is on BOTH sides, because the floor adapter '
            + 'copies too.',
        build: () => {
            const rows = rowsOf();
            let mine = new Map<string, TRowSlot>();
            let bare = new Map<string, TPriceDataRow>();
            return {
                ours: {
                    reset: () => { mine = new Map<string, TRowSlot>(); },
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            const slot = mintSlot(row.id);
                            slot.entity = { ...row };
                            mine.set(row.id, slot);
                            priceSink.ours = slot;
                        }
                    },
                },
                floor: {
                    reset: () => { bare = new Map<string, TPriceDataRow>(); },
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            const stored = { ...row };
                            bare.set(row.id, stored);
                            priceSink.floor = stored;
                        }
                    },
                },
            };
        },
    },
    {
        id: 'insert-gap.the-bucket-join',
        path: EPricePath.PerRowPerWrite,
        ours: 'slotContentService.addBucketMemberSlot(bucket, slot) per inserted slot, on OIMSlotContentSetBucketService',
        floor: 'the same loop with no row set kept at all',
        caveat:
            'WHAT A ROW SET OF EVERY INSERTED SLOT COSTS TO MAINTAIN, and it is charged to us '
            + 'alone: `baseline-array` keeps no such list, so the floor arm here is the honest '
            + 'shape of not having one. Both arms mint the slot and the copy and file them in a '
            + '`Map`; ours additionally calls the PUBLIC door `addBucketMemberSlot`, which is more than the bare '
            + '`Set.add` this row once priced (that step, `addSlot`, is protected now): it asserts the bucket is '
            + 'writable and the member not released, opens and closes a content subframe, adds to a '
            + 'set growing to the population size, holds the member slot, records the append and marks the '
            + 'bucket changed. The bucket is '
            + 'a single-slot store slot from `createOIMSingleBucketService`, so no collection is in either arm. The '
            + 'collection no longer keeps such a set of its own rows; this is the price of a '
            + 'consumer keeping one.',
        build: () => {
            const rows = rowsOf();
            const slotContentService = new OIMSlotContentSetBucketService<TRowSlot>();
            let joinedStore = new Map<string, TRowSlot>();
            const db = new OIMDB();
            let bucketSlot = holdSingleBucketSlot(db, slotContentService);
            let loneStore = new Map<string, TRowSlot>();
            return {
                ours: {
                    reset: () => {
                        joinedStore = new Map<string, TRowSlot>();
                        bucketSlot = holdSingleBucketSlot(db, slotContentService);
                    },
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            const slot = mintSlot(row.id);
                            slot.entity = { ...row };
                            joinedStore.set(row.id, slot);
                            slotContentService.addBucketMemberSlot(bucketSlot, slot);
                            priceSink.ours = slot;
                        }
                    },
                },
                floor: {
                    reset: () => { loneStore = new Map<string, TRowSlot>(); },
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            const row = rows[i];
                            const slot = mintSlot(row.id);
                            slot.entity = { ...row };
                            loneStore.set(row.id, slot);
                            priceSink.floor = slot;
                        }
                    },
                },
            };
        },
    },
    {
        id: 'insert-gap.the-copying-strategy-beyond-the-spread',
        path: EPricePath.PerRowPerWrite,
        ours: 'oimInsertEntityWithSanitizedCopy(slot, row) — the spread, then the `__proto__` own-key probe',
        floor: 'slot.entity = { ...row } — the spread alone',
        caveat:
            'THE ONE PART OF THE COPY THE FLOOR DOES NOT PAY. `baseline-array` allocates '
            + '`{ ...row }` per inserted row exactly as `oimInsertEntityWithSanitizedCopy` does, so the '
            + 'SPREAD is common ground and cannot be in the gap; what is ours alone is what '
            + '`oimInsertEntityWithSanitizedCopy` does after it — one call and one `Object.hasOwn(stored, '
            + '\'__proto__\')`, which is false on every row here, so the `delete` never runs. The '
            + 'slots are minted outside the clock and reused by both arms, so only the record is '
            + 'allocated inside either clock.',
        build: () => {
            const rows = rowsOf();
            const slots: TRowSlotEditable[] = rows.map(row => mintSlot(row.id));
            const clear = (): void => {
                for (let i = 0; i < slots.length; i++) slots[i].entity = undefined;
            };
            return {
                ours: {
                    reset: clear,
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            oimInsertEntityWithSanitizedCopy(slots[i], rows[i]);
                            priceSink.ours = slots[i];
                        }
                    },
                },
                floor: {
                    reset: clear,
                    operationsPerPass: ROWS,
                    run: times => {
                        for (let i = 0; i < times; i++) {
                            slots[i].entity = { ...rows[i] };
                            priceSink.floor = slots[i];
                        }
                    },
                },
            };
        },
    },
];
