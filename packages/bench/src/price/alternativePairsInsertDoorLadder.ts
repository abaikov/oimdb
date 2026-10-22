import {
    OIMChannelService,
    OIMDB,
    OIMSlotStoreServiceMapDriven,
    OIMUnusedSlotCollectorService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
} from '../../../core/src/index';
import type { TOIMColumnSlot, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '../../../core/src/index';
import { createOIMEntitySlot } from '../../../core/src/engine/entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlotOwnerService } from '../../../core/src/engine/entity/types/TOIMEntitySlotOwnerService';
import { OIMContentChangeDeliveryService } from '../../../core/src/engine/slot/OIMContentChangeDeliveryService';
import { OIMSlotReleasePolicyAtEmpty } from '../../../core/src/engine/collector/OIMSlotReleasePolicyAtEmpty';
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
type TRowStoreSlot = TOIMStoreSlot<Map<TOIMStoreKey, TRowSlot>, TRowSlot, Partial<TPriceDataRow>>;

const entityWriter = createOIMEntityWriterInPlace();
const slotReleasePolicy = OIMSlotReleasePolicyAtEmpty.INSTANCE;
const storeService = new OIMSlotStoreServiceMapDriven<TRowSlot>();

type TDoorProbeInternals = {
    slotOwnerService: TOIMEntitySlotOwnerService<TPriceDataRow, TOIMStoreKey, Map<TOIMStoreKey, TRowSlot>, string>;
    writeEntityWithoutSubframe(entitySlot: TRowSlot, row: TPriceDataRow, changedColumnNames: string[] | undefined): boolean;
    updateEntitySlotEmptiness(entitySlot: TRowSlot): void;
};

const createEntityService = (db: OIMDB): TPriceEntityService<TPriceDataRow> => createOIMEntityService<TPriceDataRow>(db, {
    keyOf: row => row.id,
    entityWriter,
    columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    slotEmptiness: OIMSlotEmptinessByEntityPresence.INSTANCE,
});

type TWorld = {
    readonly db: OIMDB;
    entityService: TPriceEntityService<TPriceDataRow>;
    probeInternals: TDoorProbeInternals;
    entityStoreSlot: TRowStoreSlot;
    store: Map<TOIMStoreKey, TRowSlot>;
    subframeDepth: number;
};

type TRung = (world: TWorld, rows: readonly TPriceDataRow[], times: number) => void;

const keyOf = (row: TPriceDataRow): string => row.id;

const handMint = (world: TWorld, key: string): TRowSlot =>
    createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(key), world.probeInternals.slotOwnerService, world.entityStoreSlot);

const probeMint = (world: TWorld, key: string): TRowSlot =>
    world.probeInternals.slotOwnerService.createSlot(storeService.ownKey(key), world.entityStoreSlot);

const handOpenSubframe = (world: TWorld): void => {
    OIMChannelService.INSTANCE.openSubframe(world.db.defaultChannelSlot);
    world.subframeDepth++;
};

const handCloseSubframe = (world: TWorld): void => {
    try {
        --world.subframeDepth;
    } finally {
        OIMChannelService.INSTANCE.closeSubframe(world.db.defaultChannelSlot);
    }
};

const handAssertWritable = (world: TWorld, slot: TRowSlot): void => {
    OIMChannelService.INSTANCE.assertNotFlushing(world.db.defaultChannelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
};

const handWrite = (world: TWorld, slot: TRowSlot, row: TPriceDataRow): void => {
    entityWriter.fillEntity(slot, row);
    OIMChannelService.INSTANCE.writeWithoutFlushCheck(world.db.defaultChannelSlot, slot);
};

const handUpdateEmptiness = (world: TWorld, slot: TRowSlot): void => {
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

const handRelease = (world: TWorld, slot: TRowSlot): void => {
    if (slot.holdCount > 0 || (slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0 || slot.owner !== world.probeInternals.slotOwnerService || slot.columnSlotStore !== undefined) return;
    if (slotReleasePolicy.isSlotReleasable()) throw new Error('the ladder never releases a written slot');
};

type TSteps = {
    readonly mint: (world: TWorld, key: string) => TRowSlot;
    readonly openSubframe: (world: TWorld) => void;
    readonly closeSubframe: (world: TWorld) => void;
    readonly assertWritable: (world: TWorld, slot: TRowSlot) => void;
    readonly write: (world: TWorld, slot: TRowSlot, row: TPriceDataRow) => void;
    readonly updateEmptiness: (world: TWorld, slot: TRowSlot) => void;
    readonly contentChanged: (world: TWorld, slot: TRowSlot, row: TPriceDataRow) => void;
    readonly release: (world: TWorld, slot: TRowSlot) => void;
};

const HAND_STEPS: TSteps = {
    mint: handMint,
    openSubframe: handOpenSubframe,
    closeSubframe: handCloseSubframe,
    assertWritable: handAssertWritable,
    write: handWrite,
    updateEmptiness: handUpdateEmptiness,
    contentChanged: () => undefined,
    release: handRelease,
};

const chainOf = (steps: TSteps): TRung => (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = keyOf(row);
        if (storeService.get(world.store, key) !== undefined) continue;
        const slot = steps.mint(world, key);
        steps.openSubframe(world);
        try {
            steps.assertWritable(world, slot);
            steps.write(world, slot, row);
            steps.updateEmptiness(world, slot);
            steps.contentChanged(world, slot, row);
            storeService.set(world.store, key, slot);
            steps.release(world, slot);
        } catch (refusal) {
            steps.closeSubframe(world);
            throw refusal;
        }
        steps.closeSubframe(world);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withSubframe: TSteps = {
    ...HAND_STEPS,
    openSubframe: world => OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(world.db.defaultChannelSlot),
    closeSubframe: world => OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(world.db.defaultChannelSlot),
};
const withAssert: TSteps = { ...withSubframe, assertWritable: (world, slot) => world.probeInternals.slotOwnerService.assertWritable(slot) };
const withWrite: TSteps = {
    ...withAssert,
    write: (world, slot, row) => {
        world.probeInternals.writeEntityWithoutSubframe(slot, row, undefined);
    },
};
const withEmptiness: TSteps = {
    ...withWrite,
    updateEmptiness: (world, slot) => {
        world.probeInternals.updateEntitySlotEmptiness(slot);
    },
};
const withContentChanged: TSteps = {
    ...withEmptiness,
    contentChanged: (world, slot, row) => world.probeInternals.slotOwnerService.dispatchContentChange(slot, row),
};
const withRelease: TSteps = {
    ...withContentChanged,
    release: (world, slot) => world.probeInternals.slotOwnerService.releaseSlotIfUnheldAfterListeners(slot),
};
const withMint: TSteps = { ...withRelease, mint: probeMint };

const entityServiceDoor: TRung = (world, rows, times) => {
    const { entityService, entityStoreSlot } = world;
    const slotContentService = entityService.slotContentService;
    for (let i = 0; i < times; i++) priceSink.ours = slotContentService.upsertEntity(entityStoreSlot, rows[i]);
    world.db.flush();
};

const rungSide = (rung: TRung, rows: readonly TPriceDataRow[]): TPriceSide => {
    const db = new OIMDB();
    const entityService = createEntityService(db);
    const world: TWorld = {
        db,
        entityService,
        probeInternals: entityService.slotContentService as unknown as TDoorProbeInternals,
        entityStoreSlot: entityService.createStoreSlot(db),
        store: storeService.createStore(),
        subframeDepth: 0,
    };
    return {
        operationsPerPass: rows.length,
        reset: () => {
            world.entityService = createEntityService(db);
            world.probeInternals = world.entityService.slotContentService as unknown as TDoorProbeInternals;
            world.entityStoreSlot = world.entityService.createStoreSlot(db);
            world.store = storeService.createStore();
            world.subframeDepth = 0;
        },
        run: times => rung(world, rows, times),
    };
};

const LADDER =
    'One rung of a ladder from the insert path written by hand, step by step, around the shipped pieces, to '
    + 'entityService.slotContentService.upsertEntity on the same service. Every rung swaps exactly one hand-written step for the shipped piece\'s own '
    + 'method — the content service\'s private slotOwnerService or its private write methods, reached through a cast '
    + '(`as unknown as {…}`), or OIMContentChangeDeliveryService — so the gap a rung shows is what that method '
    + 'costs beyond the hand step. The service inserts without a copy (the default) under the AtEmpty policy. Every rung '
    + 'inserts the same priceDataset.batch distinct rows into an empty world rebuilt outside the clock and ends its pass with db.flush().';

const ladderPair = (step: string, ours: TRung, oursText: string, floor: TRung, floorText: string, adds: string): TPricePair => ({
    id: `alt.ladder.insert-door.${step}`,
    path: EPricePath.PerRowPerWrite,
    ours: oursText,
    floor: floorText,
    caveat: `${LADDER} This rung adds: ${adds}`,
    build: () => {
        const rows = priceDataset.makeRows(priceDataset.batch);
        return { ours: rungSide(ours, rows), floor: rungSide(floor, rows) };
    },
});

const handChain = chainOf(HAND_STEPS);
const subframeChain = chainOf(withSubframe);
const assertChain = chainOf(withAssert);
const writeChain = chainOf(withWrite);
const emptinessChain = chainOf(withEmptiness);
const contentChangedChain = chainOf(withContentChanged);
const releaseChain = chainOf(withRelease);
const mintChain = chainOf(withMint);

export const alternativePairsInsertDoorLadder: readonly TPricePair[] = [
    ladderPair('1-subframe', subframeChain, 'openContentSubframe/closeContentSubframe through OIMContentChangeDeliveryService',
        handChain, 'every step by hand', 'the content subframe — the channel call, the channel slot\'s content subframe depth and the delivery check at its outermost close — instead of the channel call and a counter.'),
    ladderPair('2-assert-writable', assertChain, 'assertWritable through the slot owner service',
        subframeChain, 'the step below by hand', 'the slot owner service\'s assertWritable.'),
    ladderPair('3-write', writeChain, 'slotContentService.writeEntityWithoutSubframe',
        assertChain, 'the writer and the channel called by hand', 'writeEntityWithoutSubframe: the entity-undefined check, fillEntity, dispatchColumnsChanged and its column-store check.'),
    ladderPair('4-emptiness', emptinessChain, 'updateEntitySlotEmptiness through the content service and the slot owner service',
        writeChain, 'the step by hand', 'the slot owner service\'s settleEmptiness and settleWrite.'),
    ladderPair('5-content-changed', contentChangedChain, 'dispatchContentChange through the slot owner service',
        emptinessChain, 'no content-change call', 'the slot owner service\'s dispatchContentChange with no listener.'),
    ladderPair('6-release-check', releaseChain, 'releaseSlotIfUnheldAfterListeners through the slot owner service',
        contentChangedChain, 'the check by hand', 'the slot owner service\'s release check after the write.'),
    ladderPair('7-create-slot', mintChain, 'slotOwnerService.createSlot',
        releaseChain, 'createOIMEntitySlot called by hand', 'slotOwnerService.createSlot: the content service\'s private slotContentStrategy.createSlot behind the owner.'),
    ladderPair('8-door', entityServiceDoor, 'entityService.slotContentService.upsertEntity(storeSlot, entity)',
        mintChain, 'every step through the service\'s internal pieces, chained by hand',
        'upsertEntity\'s keyOf and insertEntity itself: the store lookup, ownKey, createSlot, the isOnFastPath read and the fast-path insert, which on this fixture opens no subframe, runs no contentChanged and no release check and calls entityWriter.fillEntity directly, so the floor carries steps the door does not run.'),
];
