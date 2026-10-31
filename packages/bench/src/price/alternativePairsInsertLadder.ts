import { OIMSlotOwner } from '../../../core/src/index';
import type { OIMEntitySlot } from '../../../core/src/entity/OIMEntitySlot';
import { OIMChannelService, OIMDB, OIMDefaults, OIMSlotAtEmptyReleasePolicy, OIMSlotMapStoreService, OIMUnusedSlotCollectorService, createOIMInPlaceEntityWriter, oimInsertEntityWithSanitizedCopy } from '../../../core/src/index';
import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '../../../core/src/index';
import { createOIMEntitySlot } from '../../../core/src/entity/utils/createOIMEntitySlot';
import { oimSanitizedCopyEntity } from '../../../core/src/entity/utils/oimSanitizedCopyEntity';
import { OIMSlotEntityPresenceEmptinessPolicy } from '../../../core/src/entity/OIMSlotEntityPresenceEmptinessPolicy';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from '../../../core/src/slot/constants/OIM_SLOT_FLAG_RELEASED';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import type { TPriceEntityService } from './priceFixture';
import { priceSink } from './priceSink';
import type { TPriceDataRow } from './TPriceDataRow';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';
import { createOIMEntityContentService } from '../../../core/src/index';
import { createOIMSlotCollectionService } from '../../../core/src/index';

type TRowSlot = TOIMEntitySlot<TPriceDataRow, TOIMStoreKey>;

type TWorld = {
    readonly db: OIMDB;
    plainMap: Map<string, object>;
    slotMap: Map<string, TRowSlot>;
    store: Map<TOIMStoreKey, TRowSlot>;
    entityService: TPriceEntityService<TPriceDataRow>;
    entityStoreSlot: TOIMStoreSlot<Map<TOIMStoreKey, TRowSlot>, TRowSlot, Partial<TPriceDataRow>>;
};

type TRung = (world: TWorld, rows: readonly TPriceDataRow[], times: number) => void;

const storeService = new OIMSlotMapStoreService<TRowSlot>();
const entityWriter = createOIMInPlaceEntityWriter({ entityInserter: oimInsertEntityWithSanitizedCopy });
const slotReleasePolicy = new OIMSlotAtEmptyReleasePolicy();
const slotOwner = new OIMSlotOwner();
const channelService = OIMChannelService.INSTANCE;
const contentChangeListeners: unknown[] = [];

const createEntityService = (): TPriceEntityService<TPriceDataRow> =>
    createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TPriceDataRow>({ entityWriter }) });

const createWorld = (): TWorld => {
    const db = new OIMDB();
    const entityService = createEntityService();
    return {
        db,
        plainMap: new Map(),
        slotMap: new Map(),
        store: storeService.createStore(),
        entityService,
        entityStoreSlot: entityService.createStoreSlot(db),
    };
};

const emptyWorld = (world: TWorld): void => {
    world.plainMap = new Map();
    world.slotMap = new Map();
    world.store = storeService.createStore();
    world.entityService = createEntityService();
    world.entityStoreSlot = world.entityService.createStoreSlot(world.db);
};

const keyOf = (row: TPriceDataRow): string => row.id;

const mint = (world: TWorld, key: string): TRowSlot | undefined => {
    if (storeService.get(world.store, key) !== undefined) return undefined;
    return createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(key), slotOwner, world.entityStoreSlot as TOIMStoreSlot);
};

const fill = (world: TWorld, slot: TRowSlot, row: TPriceDataRow): void => {
    entityWriter.fillEntity(slot as unknown as OIMEntitySlot, row);
    channelService.writeWithoutFlushCheck(world.db.defaultChannelSlot, slot);
};

const assertWritable = (world: TWorld, slot: TRowSlot): void => {
    channelService.assertNotFlushing(world.db.defaultChannelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
};

const updateEmptiness = (world: TWorld, slot: TRowSlot): void => {
    const slotFlags = slot.slotFlags;
    const wasEmpty = (slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    (slot as { slotFlags: number }).slotFlags = OIMSlotEntityPresenceEmptinessPolicy.INSTANCE.isEmpty(slot)
        ? slotFlags | OIM_SLOT_FLAG_EMPTY
        : slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    const slotStamp = OIMDefaults.INSTANCE.slotStamp;
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

const releaseSlotIfUnheldAfterListeners = (slot: TRowSlot): void => {
    if (slot.holdCount > 0 || (slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0 || slot.owner !== slotOwner || slot.columnSlotStore !== undefined) return;
    if (!slotReleasePolicy.isSlotReleasable()) return;
    throw new Error('the ladder never releases a written slot');
};

const fileWritten = (world: TWorld, slot: TRowSlot, key: string): void => {
    storeService.set(world.store, key, slot);
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
        map.set(row.id, oimSanitizedCopyEntity(row));
    }
    priceSink.number = map.size;
};

const slotIntoMap: TRung = (world, rows, times) => {
    const map = world.slotMap;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(row.id, slotOwner, world.entityStoreSlot as TOIMStoreSlot);
        (slot as unknown as { content: TPriceDataRow | undefined }).content = oimSanitizedCopyEntity(row) as TPriceDataRow;
        map.set(row.id, slot);
    }
    priceSink.number = map.size;
};

const probedSlotIntoMap: TRung = (world, rows, times) => {
    const map = world.slotMap;
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        if (map.get(row.id) !== undefined) continue;
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(row.id, slotOwner, world.entityStoreSlot as TOIMStoreSlot);
        (slot as unknown as { content: TPriceDataRow | undefined }).content = oimSanitizedCopyEntity(row) as TPriceDataRow;
        map.set(row.id, slot);
    }
    priceSink.number = map.size;
};

const slotIntoStore: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        if (storeService.get(world.store, row.id) !== undefined) continue;
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(row.id), slotOwner, world.entityStoreSlot as TOIMStoreSlot);
        (slot as unknown as { content: TPriceDataRow | undefined }).content = oimSanitizedCopyEntity(row) as TPriceDataRow;
        storeService.set(world.store, row.id, slot);
    }
    priceSink.number = world.store.size;
};

const keyedSlotIntoStore: TRung = (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        if (storeService.get(world.store, key) !== undefined) continue;
        const slot = createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(key), slotOwner, world.entityStoreSlot as TOIMStoreSlot);
        (slot as unknown as { content: TPriceDataRow | undefined }).content = oimSanitizedCopyEntity(row) as TPriceDataRow;
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
        else releaseSlotIfUnheldAfterListeners(slot);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const entityServiceDoor: TRung = (world, rows, times) => {
    const { entityService, entityStoreSlot } = world;
    for (let i = 0; i < times; i++) priceSink.ours = entityService.writeSlotContentByKey(entityStoreSlot, rows[i].id, rows[i]);
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
    'One rung of a ladder from `map.set(id, { ...entity })` to `entityService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)` for a key the population has '
    + 'never seen. Every rung inserts the same priceDataset.batch distinct rows into an empty world rebuilt outside the clock, '
    + 'and adds exactly one step of the insert branch of OIMEntityContentService.insertSlotContent to the rung below it, written by hand around the '
    + 'shipped pieces: oimSanitizedCopyEntity, createOIMEntitySlot, OIMSlotMapStoreService, an in-place writer with oimInsertEntityWithSanitizedCopy, the '
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
    ladderPair('1-copy', copyIntoMap, 'map.set(id, oimSanitizedCopyEntity(entity))',
        spreadIntoMap, 'map.set(id, { ...entity })',
        'oimSanitizedCopyEntity instead of the bare spread: the spread plus the own-`__proto__` probe and its delete.'),
    ladderPair('2-slot', slotIntoMap, 'map.set(id, slot) with slot = createOIMEntitySlot(id, owner), slot.content = the copy',
        copyIntoMap, 'map.set(id, oimSanitizedCopyEntity(entity))',
        'the fourteen-field slot object the copy is stored in.'),
    ladderPair('3-probe', probedSlotIntoMap, 'map.get(id) first, then map.set(id, slot)',
        slotIntoMap, 'map.set(id, slot)',
        'the probe writeSlotContentByKey opens with, on the bare Map.'),
    ladderPair('4-identity-store', slotIntoStore, 'the store service: get, ownKey, set',
        probedSlotIntoMap, 'map.get(id), then map.set(id, slot)',
        'the store service in place of the bare Map for the probe and the filing (setByKey).'),
    ladderPair('5-key-of', keyedSlotIntoStore, 'the key read through a keyOf function',
        slotIntoStore, 'the key read as row.id',
        'a keyOf call, which writeSlotContentByKey does not make: its caller passes the key. The rungs above keep it, so they carry one call the door does not run.'),
    ladderPair('6-writer-and-channel', writerAndChannel, 'the shipped writer fills the slot, then OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot); db.flush() per pass',
        keyedSlotIntoStore, 'the copy assigned by hand, no channel',
        'what insertSlotContent runs to land the entity: the shipped writer\'s fillEntity and the channel write that stamps the slot.'),
    ladderPair('7-assert-writable', withAssert, 'OIMChannelService.INSTANCE.assertNotFlushing(channelSlot) and the released check before filing',
        writerAndChannel, 'the writer and the channel',
        'assertWritable.'),
    ladderPair('8-emptiness', withEmptiness, 'the emptiness check and the release policy notified, as settleEmptiness does',
        withAssert, 'the assert, the writer and the channel',
        'settleEmptiness: the emptiness strategy, the slot-stamp check, onSlotWritten, and the idle check of a slot nobody subscribes to.'),
    ladderPair('9-content-changed', withContentChanged, 'the content-change step with no listener',
        withEmptiness, 'the steps below without it',
        'dispatchContentChange, which returns at once when the collection has no listener. The shipped insert calls it only off its fast path, not on the fast path this fixture takes.'),
    ladderPair('10-release-check', withReleaseCheck, 'the release check after filing',
        withContentChanged, 'the steps below without it',
        'releaseSlotIfUnheldAfterListeners: isReleasable and the policy question. The shipped insert runs no release check on its fast path.'),
    ladderPair('12-collection-door', entityServiceDoor, 'entityService.writeSlotContentByKey(entityStoreSlot, id, entity); db.flush() per pass',
        withReleaseCheck, 'the same steps written by hand around the shipped pieces',
        'the shipped door, which on this fixture takes its fast path: no dispatchContentChange and no release check, so the floor carries two steps the door does not run.'),
];
