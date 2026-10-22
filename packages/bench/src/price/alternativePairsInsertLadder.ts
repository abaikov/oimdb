import {
    OIMChannelService,
    OIMDB,
    OIMSlotOwner,
    OIMSlotReleasePolicyAtEmpty,
    OIMSlotStoreServiceMapDriven,
    OIMUnusedSlotCollectorService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    oimInsertEntityWithSanitizedCopy,
} from '../../../core/src/index';
import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '../../../core/src/index';
import { createOIMEntitySlot } from '../../../core/src/engine/entity/utils/createOIMEntitySlot';
import { oimCopyEntitySanitized } from '../../../core/src/engine/entity/utils/oimCopyEntitySanitized';
import { OIMSlotEmptinessByEntityPresence } from '../../../core/src/engine/entity/OIMSlotEmptinessByEntityPresence';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_RELEASED';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import type { TPriceEntityService } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TRowSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;

type TWorld = {
    readonly db: OIMDB;
    plainMap: Map<string, object>;
    slotMap: Map<string, TRowSlot>;
    store: Map<TOIMStoreKey, TRowSlot>;
    entityService: TPriceEntityService<TPriceDataRow>;
    entityStoreSlot: TOIMStoreSlot<Map<TOIMStoreKey, TRowSlot>, TRowSlot, Partial<TPriceDataRow>>;
    subframeDepth: number;
};

type TRung = (world: TWorld, rows: readonly TPriceDataRow[], times: number) => void;

const storeService = new OIMSlotStoreServiceMapDriven<TRowSlot>();
const entityWriter = createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithSanitizedCopy });
const slotReleasePolicy = new OIMSlotReleasePolicyAtEmpty();
const slotOwner = new OIMSlotOwner();
const channelService = OIMChannelService.INSTANCE;
const contentChangeListeners: unknown[] = [];
const subframeChangedSlots: TRowSlot[] = [];

const createEntityService = (db: OIMDB): TPriceEntityService<TPriceDataRow> =>
    createOIMEntityService<TPriceDataRow>(db, { keyOf: row => row.id, entityWriter });

const createWorld = (): TWorld => {
    const db = new OIMDB();
    const entityService = createEntityService(db);
    return {
        db,
        plainMap: new Map(),
        slotMap: new Map(),
        store: storeService.createStore(),
        entityService,
        entityStoreSlot: entityService.createStoreSlot(db),
        subframeDepth: 0,
    };
};

const emptyWorld = (world: TWorld): void => {
    world.plainMap = new Map();
    world.slotMap = new Map();
    world.store = storeService.createStore();
    world.entityService = createEntityService(world.db);
    world.entityStoreSlot = world.entityService.createStoreSlot(world.db);
    world.subframeDepth = 0;
};

const keyOf = (row: TPriceDataRow): string => row.id;

const mint = (world: TWorld, key: string): TRowSlot | undefined => {
    if (storeService.get(world.store, key) !== undefined) return undefined;
    return createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(key), slotOwner);
};

const fill = (world: TWorld, slot: TRowSlot, row: TPriceDataRow): void => {
    entityWriter.fillEntity(slot, row);
    channelService.writeWithoutFlushCheck(world.db.defaultChannelSlot, slot);
};

const assertWritable = (world: TWorld, slot: TRowSlot): void => {
    channelService.assertNotFlushing(world.db.defaultChannelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
};

const updateEmptiness = (world: TWorld, slot: TRowSlot): void => {
    const slotFlags = slot.slotFlags;
    const wasEmpty = (slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    (slot as { slotFlags: number }).slotFlags = OIMSlotEmptinessByEntityPresence.INSTANCE.isEmpty(slot)
        ? slotFlags | OIM_SLOT_FLAG_EMPTY
        : slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    const slotStamp = world.db.slotStamp;
    if (slotStamp !== undefined) slotStamp.stamp(slot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0) return;
    slotReleasePolicy.onSlotWritten();
    if (wasEmpty && (slot.effects === undefined || slot.effects.length === 0) && slotReleasePolicy.onSlotIdle()) {
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(world.db.collectorSlot.unusedSlotCollectorSlot, slot);
    }
};

const contentChanged = (): void => {
    if (contentChangeListeners.length === 0) return;
    throw new Error('the ladder runs with no content listener');
};

const releaseSlotIfUnheldAfterListeners = (world: TWorld, slot: TRowSlot): void => {
    if (
        world.subframeDepth > 0
        && subframeChangedSlots.length !== 0
        && subframeChangedSlots[subframeChangedSlots.length - 1] === slot
    ) return;
    if (slot.holdCount > 0 || (slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0 || slot.owner !== slotOwner || slot.columnSlotStore !== undefined) return;
    if (!slotReleasePolicy.isSlotReleasable()) return;
    throw new Error('the ladder never releases a written slot');
};

const fileWritten = (world: TWorld, slot: TRowSlot, key: string): void => {
    storeService.set(world.store, key, slot);
};

const closeSubframe = (world: TWorld): void => {
    try {
        if (--world.subframeDepth > 0 || subframeChangedSlots.length === 0) return;
        throw new Error('the ladder runs with no content listener');
    } finally {
        channelService.closeSubframe(world.db.defaultChannelSlot);
    }
};

const spreadIntoMap: TRung = (world, rows, times) => {
    const map = world.plainMap;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        map.set(row.id, { ...row });
    }
    priceSink.number = map.size;
};

const copyIntoMap: TRung = (world, rows, times) => {
    const map = world.plainMap;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        map.set(row.id, oimCopyEntitySanitized(row));
    }
    priceSink.number = map.size;
};

const slotIntoMap: TRung = (world, rows, times) => {
    const map = world.slotMap;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(row.id, slotOwner);
        (slot as { entity: TPriceDataRow | undefined }).entity = oimCopyEntitySanitized(row) as TPriceDataRow;
        map.set(row.id, slot);
    }
    priceSink.number = map.size;
};

const probedSlotIntoMap: TRung = (world, rows, times) => {
    const map = world.slotMap;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        if (map.get(row.id) !== undefined) continue;
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(row.id, slotOwner);
        (slot as { entity: TPriceDataRow | undefined }).entity = oimCopyEntitySanitized(row) as TPriceDataRow;
        map.set(row.id, slot);
    }
    priceSink.number = map.size;
};

const slotIntoStore: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        if (storeService.get(world.store, row.id) !== undefined) continue;
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(row.id), slotOwner);
        (slot as { entity: TPriceDataRow | undefined }).entity = oimCopyEntitySanitized(row) as TPriceDataRow;
        storeService.set(world.store, row.id, slot);
    }
    priceSink.number = world.store.size;
};

const keyedSlotIntoStore: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        if (storeService.get(world.store, key) !== undefined) continue;
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(key), slotOwner);
        (slot as { entity: TPriceDataRow | undefined }).entity = oimCopyEntitySanitized(row) as TPriceDataRow;
        storeService.set(world.store, key, slot);
    }
    priceSink.number = world.store.size;
};

const writerAndChannel: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        const slot = mint(world, key);
        if (slot === undefined) continue;
        fill(world, slot, row);
        fileWritten(world, slot, key);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withAssert: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        const slot = mint(world, key);
        if (slot === undefined) continue;
        assertWritable(world, slot);
        fill(world, slot, row);
        fileWritten(world, slot, key);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withEmptiness: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        const slot = mint(world, key);
        if (slot === undefined) continue;
        assertWritable(world, slot);
        fill(world, slot, row);
        updateEmptiness(world, slot);
        fileWritten(world, slot, key);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withContentChanged: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        const slot = mint(world, key);
        if (slot === undefined) continue;
        assertWritable(world, slot);
        fill(world, slot, row);
        updateEmptiness(world, slot);
        contentChanged();
        fileWritten(world, slot, key);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withReleaseCheck: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        const slot = mint(world, key);
        if (slot === undefined) continue;
        assertWritable(world, slot);
        fill(world, slot, row);
        updateEmptiness(world, slot);
        contentChanged();
        fileWritten(world, slot, key);
        if ((slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0) OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(world.db.collectorSlot.unusedSlotCollectorSlot, slot);
        else releaseSlotIfUnheldAfterListeners(world, slot);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withSubframe: TRung = (world, rows, times) => {
    const channelSlot = world.db.defaultChannelSlot;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        const slot = mint(world, key);
        if (slot === undefined) continue;
        channelService.openSubframe(channelSlot);
        world.subframeDepth++;
        try {
            assertWritable(world, slot);
            fill(world, slot, row);
            updateEmptiness(world, slot);
            contentChanged();
            fileWritten(world, slot, key);
            if ((slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0) OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(world.db.collectorSlot.unusedSlotCollectorSlot, slot);
            else releaseSlotIfUnheldAfterListeners(world, slot);
        } catch (refusal) {
            closeSubframe(world);
            throw refusal;
        }
        closeSubframe(world);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const entityServiceDoor: TRung = (world, rows, times) => {
    const { entityService, entityStoreSlot } = world;
    for (let i = 0; i < times; i++) priceSink.ours = entityService.slotContentService.upsertEntity(entityStoreSlot, rows[i]);
    world.db.flush();
};

const rungSide = (rung: TRung, rows: readonly TPriceDataRow[]): TPriceSide => {
    const world = createWorld();
    return {
        operationsPerPass: rows.length,
        reset: () => emptyWorld(world),
        run: times => rung(world, rows, times),
    };
};

const LADDER =
    'One rung of a ladder from `map.set(id, { ...entity })` to `entityService.upsertEntity(entityStoreSlot, entity)` for a key the population has '
    + 'never seen. Every rung inserts the same priceDataset.batch distinct rows into an empty world rebuilt outside the clock, '
    + 'and adds exactly one step of the insert branch of OIMSlotContentEntityService.insertEntity to the rung below it, written by hand around the '
    + 'shipped pieces: oimCopyEntitySanitized, createOIMEntitySlot, OIMSlotStoreServiceMapDriven, an in-place writer with oimInsertEntityWithSanitizedCopy, the '
    + 'channel, the emptiness check, the AtEmpty release policy. Each pair re-measures the rung below as its floor in its '
    + 'own run, so a ratio prices only what its rung adds. From the writer-and-channel rung on, each pass ends with db.flush().';

const ladderPair = (step: string, ours: TRung, oursText: string, floor: TRung, floorText: string, adds: string): TPricePair => ({
    id: `alt.ladder.insert.${step}`,
    path: EPricePath.PerRowPerWrite,
    ours: oursText,
    floor: floorText,
    caveat: `${LADDER} This rung adds: ${adds}`,
    build: () => {
        const rows = priceDataset.makeRows(priceDataset.batch);
        return { ours: rungSide(ours, rows), floor: rungSide(floor, rows) };
    },
});

export const alternativePairsInsertLadder: readonly TPricePair[] = [
    ladderPair('1-copy', copyIntoMap, 'map.set(id, oimCopyEntitySanitized(entity))',
        spreadIntoMap, 'map.set(id, { ...entity })',
        'oimCopyEntitySanitized instead of the bare spread: the spread plus the own-`__proto__` probe and its delete.'),
    ladderPair('2-slot', slotIntoMap, 'map.set(id, slot) with slot = createOIMEntitySlot(id, owner), slot.entity = the copy',
        copyIntoMap, 'map.set(id, oimCopyEntitySanitized(entity))',
        'the fourteen-field slot object the copy is stored in.'),
    ladderPair('3-probe', probedSlotIntoMap, 'map.get(id) first, then map.set(id, slot)',
        slotIntoMap, 'map.set(id, slot)',
        'the probe writeContentByKey opens with, on the bare Map.'),
    ladderPair('4-identity-store', slotIntoStore, 'the store service: get, ownKey, set',
        probedSlotIntoMap, 'map.get(id), then map.set(id, slot)',
        'the store service in place of the bare Map for the probe and the filing (setByKey).'),
    ladderPair('5-key-of', keyedSlotIntoStore, 'the key read through a keyOf function',
        slotIntoStore, 'the key read as row.id',
        'the keyOf call upsertEntity makes before writeContentByKey.'),
    ladderPair('6-writer-and-channel', writerAndChannel, 'the shipped writer fills the slot, then OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot); db.flush() per pass',
        keyedSlotIntoStore, 'the copy assigned by hand, no channel',
        'what insertEntity runs to land the entity: the shipped writer\'s fillEntity and the channel write that stamps the slot.'),
    ladderPair('7-assert-writable', withAssert, 'OIMChannelService.INSTANCE.assertNotFlushing(channelSlot) and the released check before filing',
        writerAndChannel, 'the writer and the channel',
        'assertWritable.'),
    ladderPair('8-emptiness', withEmptiness, 'the emptiness check and the release policy notified, as settleEmptiness does',
        withAssert, 'the assert, the writer and the channel',
        'settleEmptiness: the emptiness strategy, the slot-stamp check, onSlotWritten, and the idle check of a slot nobody subscribes to.'),
    ladderPair('9-content-changed', withContentChanged, 'the content-change step with no listener',
        withEmptiness, 'the steps below without it',
        'dispatchContentChange, which returns at once when the collection has no listener. The shipped insert calls it only on its subframe path (insertEntityInSubframe), not on the fast path this fixture takes.'),
    ladderPair('10-release-check', withReleaseCheck, 'the release check after filing',
        withContentChanged, 'the steps below without it',
        'releaseSlotIfUnheldAfterListeners: the subframe-tail check, isReleasable and the policy question. The shipped insert runs no release check on its fast path, and on its subframe path calls releaseWrittenSlotIfUnheld instead.'),
    ladderPair('11-subframe', withSubframe, 'every step inside OIMChannelService.INSTANCE.openSubframe/closeSubframe with try/catch, as insertEntityInSubframe runs them',
        withReleaseCheck, 'the same steps without a subframe',
        'the subframe the insert opens around itself, and the try/catch around it.'),
    ladderPair('12-collection-door', entityServiceDoor, 'entityService.upsertEntity(entityStoreSlot, entity); db.flush() per pass',
        withSubframe, 'the same steps written by hand around the shipped pieces',
        'the shipped door, which on this fixture takes its fast path (insertEntity): no subframe, no dispatchContentChange and no release check, so the floor carries three steps the door does not run.'),
];
