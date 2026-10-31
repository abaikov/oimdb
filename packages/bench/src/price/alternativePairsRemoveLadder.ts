import { OIMChannelService, OIMDB, OIMSlotMapStoreService, createOIMInPlaceEntityWriter } from '../../../core/src/index';
import type { TOIMEntitySlot, TOIMEditable, TOIMStoreKey, TOIMStoreSlot } from '../../../core/src/index';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from '../../../core/src/slot/constants/OIM_SLOT_FLAG_RELEASED';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import type { TPriceEntityService } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';
import { createOIMSlotContentEntityService } from '../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../core/src/index';

type TRemoveSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;
type TRemoveFixture = {
    readonly db: OIMDB;
    entityService: TPriceEntityService<TPriceDataRow>;
    entityStoreSlot: TOIMStoreSlot<Map<TOIMStoreKey, TRemoveSlot>, TRemoveSlot, Partial<TPriceDataRow>>;
    slots: TRemoveSlot[];
    handStore: Map<TOIMStoreKey, TRemoveSlot>;
    rowsById: Map<string, TPriceDataRow>;
};
type TRemoveRung = (fixture: TRemoveFixture, rows: readonly TPriceDataRow[], times: number) => void;

const shippedWriter = createOIMInPlaceEntityWriter();
const channelService = OIMChannelService.INSTANCE;
const slotStoreService = new OIMSlotMapStoreService<TRemoveSlot>();

const mapDeleteById: TRemoveRung = (fixture, rows, times) => {
    const rowsById = fixture.rowsById;
    for (let i = 0; i < times; i++) rowsById.delete(rows[i].id);
};

const mapDeleteBySlotKey: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    const handStore = fixture.handStore;
    for (let i = 0; i < times; i++) handStore.delete(slots[i].key);
};

const storeServiceRemove: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    const handStore = fixture.handStore;
    for (let i = 0; i < times; i++) slotStoreService.remove(handStore, slots[i].key);
};

const clearAndUnfile = (fixture: TRemoveFixture, slot: TRemoveSlot): void => {
    shippedWriter.clearEntity(slot);
    const editableSlot = slot as TOIMEditable<TRemoveSlot>;
    editableSlot.slotFlags |= OIM_SLOT_FLAG_EMPTY;
    slotStoreService.remove(fixture.handStore, slot.key);
    editableSlot.slotFlags |= OIM_SLOT_FLAG_RELEASED;
};

const writerClear: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    for (let i = 0; i < times; i++) clearAndUnfile(fixture, slots[i]);
};

const announceClearAndUnfile = (fixture: TRemoveFixture, slot: TRemoveSlot): void => {
    channelService.writeWithoutFlushCheck(fixture.db.defaultChannelSlot, slot);
    clearAndUnfile(fixture, slot);
};

const writerClearAndChannel: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    for (let i = 0; i < times; i++) announceClearAndUnfile(fixture, slots[i]);
};

const assertHandWritable = (fixture: TRemoveFixture, slot: TRemoveSlot): void => {
    channelService.assertNotFlushing(fixture.db.defaultChannelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
};

const withWriteAsserts: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    for (let i = 0; i < times; i++) {
        assertHandWritable(fixture, slots[i]);
        announceClearAndUnfile(fixture, slots[i]);
    }
};

const flatDoorCandidate: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    const channelSlot = fixture.db.defaultChannelSlot;
    for (let i = 0; i < times; i++) {
        const slot = slots[i];
        assertHandWritable(fixture, slot);
        if (slot.entity === undefined) continue;
        channelService.writeWithoutFlushCheck(channelSlot, slot);
        shippedWriter.clearEntity(slot);
        (slot as TOIMEditable<TRemoveSlot>).slotFlags |= OIM_SLOT_FLAG_EMPTY;
        slot.owner.releaseSlotIfUnheld(slot);
    }
};

const entityServiceDoor: TRemoveRung = (fixture, _rows, times) => {
    const slots = fixture.slots;
    const slotContentService = fixture.entityService.slotContentService;
    for (let i = 0; i < times; i++) slotContentService.clearSlotContent(slots[i]);
};

const removeRungSide = (rung: TRemoveRung): TPriceSide => {
    const rows = priceDataset.makeRows(priceDataset.batch);
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TPriceDataRow>() });
    const fixture: TRemoveFixture = {
        db,
        entityService,
        entityStoreSlot: entityService.createStoreSlot(db),
        slots: [],
        handStore: new Map(),
        rowsById: new Map(),
    };
    return {
        operationsPerPass: rows.length,
        reset: () => {
            fixture.entityService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TPriceDataRow>() });
            fixture.entityStoreSlot = fixture.entityService.createStoreSlot(db);
            fixture.slots = fixture.entityService.writeInBatch(fixture.entityStoreSlot, () => (rows).map(entity => fixture.entityService.writeSlotContentByKey(fixture.entityStoreSlot, entity.id, entity)));
            db.flush();
            const handStore = new Map<TOIMStoreKey, TRemoveSlot>();
            const rowsById = new Map<string, TPriceDataRow>();
            for (let i = 0; i < rows.length; i++) {
                handStore.set(fixture.slots[i].key, fixture.slots[i]);
                rowsById.set(rows[i].id, { ...rows[i] });
            }
            fixture.handStore = handStore;
            fixture.rowsById = rowsById;
        },
        run: times => {
            rung(fixture, rows, times);
            db.flush();
            priceSink.number = fixture.handStore.size + fixture.rowsById.size + fixture.entityService.getSlotCount(fixture.entityStoreSlot);
        },
    };
};

const REMOVE_LADDER =
    'One rung of a ladder from `map.delete(id)` to `entityService.slotContentService.clearSlotContent(slot)` on an entity collection with no index, subscriber, column or hold. '
    + 'Every rung removes the same priceDataset.batch entities in the same order, one pass per population; the population is rebuilt between passes, untimed, '
    + 'and `db.flush()` closes every pass on every rung. Each rung adds exactly one thing to the rung below it, and each pair re-measures the rung below as its floor in its own run. '
    + 'The hand rungs unfile into a Map of their own keyed by the same key strings; the collection\'s own store still holds the slots and is dropped at reset.';

const removePair = (step: string, ours: TRemoveRung, oursText: string, floor: TRemoveRung, floorText: string, adds: string): TPricePair => ({
    id: `alt.ladder.remove.${step}`,
    path: EPricePath.PerWrite,
    ours: oursText,
    floor: floorText,
    caveat: `${REMOVE_LADDER} This rung adds: ${adds}`,
    build: () => ({ ours: removeRungSide(ours), floor: removeRungSide(floor) }),
});

export const alternativePairsRemoveLadder: readonly TPricePair[] = [
    removePair('1-slot-key', mapDeleteBySlotKey, 'handStore.delete(slot.key) on a Map of slots',
        mapDeleteById, 'map.delete(row.id) on a Map of row copies',
        'reaching the key through the slot instead of the row; the key strings are the same objects.'),
    removePair('2-store-service', storeServiceRemove, 'slotStoreService.remove(store, slot.key)',
        mapDeleteBySlotKey, 'handStore.delete(slot.key)',
        'the call through the shipped Map-driven slot store service.'),
    removePair('3-writer-clear', writerClear, 'writer.clearEntity(slot), isEmpty = true, slotStoreService.remove, isReleased = true',
        storeServiceRemove, 'slotStoreService.remove(store, slot.key)',
        'clearing the value through the shipped in-place writer and marking the slot empty and released.'),
    removePair('4-channel', writerClearAndChannel, 'OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot), then the clear and unfile',
        writerClear, 'the clear and unfile',
        'the channel write that stamps the slot.'),
    removePair('5-write-asserts', withWriteAsserts, 'assertNotFlushing and the released check, then the channel, clear and unfile',
        writerClearAndChannel, 'the channel, clear and unfile',
        'the two checks assertWritable runs.'),
    removePair('8-collection-door', entityServiceDoor, 'entityService.slotContentService.clearSlotContent(slot)',
        withWriteAsserts, 'the same steps written by hand',
        'the shipped door in place of the hand steps. On this fixture clearSlotContent takes its fast path — assertWritable, the isOnFastPath read, writer.clearEntity, the channel write, markEmptiness and releaseSlotIfUnheld — and runs no settleEmptiness and no dispatchContentChange.'),
    removePair('9-flat-door-candidate', flatDoorCandidate,
        'assertWritable by hand, channel write, writer.clearEntity, isEmpty = true, slot.owner.releaseSlotIfUnheld (one slot.owner read per slot)',
        entityServiceDoor, 'entityService.slotContentService.clearSlotContent(slot)',
        'nothing over rung 8 in shape: the shipped clearSlotContent is itself flat on this fixture, so this rung differs from it by about the isOnFastPath read, markEmptiness with a slotEmptinessPolicy.isEmpty call against a bare isEmpty = true, and the hand-inlined asserts against the assertWritable call; both keep the shipped release check and unfile.'),
];
