import type { OIMEntitySlot } from '../../../core/src/entity/OIMEntitySlot';
import { OIMChannelService, OIMDB, OIMDefaults, OIMSlotMapStoreService, OIMUnusedSlotCollectorService, createOIMInPlaceEntityWriter } from '../../../core/src/index';
import type { TOIMColumnSlot, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '../../../core/src/index';
import { createOIMEntitySlot } from '../../../core/src/entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlotOwnerService } from '../../../core/src/entity/types/TOIMEntitySlotOwnerService';
import { OIMSlotAtEmptyReleasePolicy } from '../../../core/src/collector/OIMSlotAtEmptyReleasePolicy';
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
type TRowStoreSlot = TOIMStoreSlot<Map<TOIMStoreKey, TRowSlot>, TRowSlot, Partial<TPriceDataRow>>;

const entityWriter = createOIMInPlaceEntityWriter();
const slotReleasePolicy = OIMSlotAtEmptyReleasePolicy.INSTANCE;
const storeService = new OIMSlotMapStoreService<TRowSlot>();

type TRowSlotOwnerService = TOIMEntitySlotOwnerService<TPriceDataRow, TRowSlot, Map<TOIMStoreKey, TRowSlot>, string>;

type TDoorProbeInternals = {
    slotOwnerService: TRowSlotOwnerService;
    writeEntityToSlot(entitySlot: TRowSlot, row: TPriceDataRow, changedColumnNames: string[] | undefined): boolean;
    updateEntitySlotEmptiness(entitySlot: TRowSlot): void;
};

const probeInternalsOf = (entityService: TPriceEntityService<TPriceDataRow>): TDoorProbeInternals => {
    const slotContentService = entityService.slotContentService as unknown as Omit<TDoorProbeInternals, 'slotOwnerService'>;
    return {
        slotOwnerService: (entityService as unknown as { slotOwnerService: TRowSlotOwnerService }).slotOwnerService,
        writeEntityToSlot: (entitySlot, row, changedColumnNames) => slotContentService.writeEntityToSlot.call(entityService.slotContentService, entitySlot, row, changedColumnNames),
        updateEntitySlotEmptiness: entitySlot => slotContentService.updateEntitySlotEmptiness.call(entityService.slotContentService, entitySlot),
    };
};

const createEntityService = (): TPriceEntityService<TPriceDataRow> => createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TPriceDataRow>({ entityWriter, slotEmptinessPolicy: OIMSlotEntityPresenceEmptinessPolicy.INSTANCE }), columnSlotStoreService: new OIMSlotMapStoreService<TOIMColumnSlot>() });

type TWorld = {
    readonly db: OIMDB;
    entityService: TPriceEntityService<TPriceDataRow>;
    probeInternals: TDoorProbeInternals;
    entityStoreSlot: TRowStoreSlot;
    store: Map<TOIMStoreKey, TRowSlot>;
};

type TRung = (world: TWorld, rows: readonly TPriceDataRow[], times: number) => void;

const selectKey = (row: TPriceDataRow): string => row.id;

const handMint = (world: TWorld, key: string): TRowSlot =>
    createOIMEntitySlot<TPriceDataRow, TOIMStoreKey>(storeService.ownKey(key), world.probeInternals.slotOwnerService, world.entityStoreSlot);

const probeMint = (world: TWorld, key: string): TRowSlot =>
    world.entityService.slotContentService.createSlot(storeService.ownKey(key), world.entityStoreSlot, world.probeInternals.slotOwnerService);

const handAssertWritable = (world: TWorld, slot: TRowSlot): void => {
    OIMChannelService.INSTANCE.assertNotFlushing(world.db.defaultChannelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
};

const handWrite = (world: TWorld, slot: TRowSlot, row: TPriceDataRow): void => {
    entityWriter.fillEntity(slot as unknown as OIMEntitySlot, row);
    OIMChannelService.INSTANCE.writeWithoutFlushCheck(world.db.defaultChannelSlot, slot);
};

const handUpdateEmptiness = (world: TWorld, slot: TRowSlot): void => {
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

const handRelease = (world: TWorld, slot: TRowSlot): void => {
    if (slot.holdCount > 0 || (slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0 || slot.owner !== world.probeInternals.slotOwnerService || slot.columnSlotStore !== undefined) return;
    if (slotReleasePolicy.isSlotReleasable()) throw new Error('the ladder never releases a written slot');
};

type TSteps = {
    readonly mint: (world: TWorld, key: string) => TRowSlot;
    readonly assertWritable: (world: TWorld, slot: TRowSlot) => void;
    readonly write: (world: TWorld, slot: TRowSlot, row: TPriceDataRow) => void;
    readonly updateEmptiness: (world: TWorld, slot: TRowSlot) => void;
    readonly contentChanged: (world: TWorld, slot: TRowSlot, row: TPriceDataRow) => void;
    readonly release: (world: TWorld, slot: TRowSlot) => void;
};

const HAND_STEPS: TSteps = {
    mint: handMint,
    assertWritable: handAssertWritable,
    write: handWrite,
    updateEmptiness: handUpdateEmptiness,
    contentChanged: () => undefined,
    release: handRelease,
};

const chainOf = (steps: TSteps): TRung => (world, rows, times) => {
    for (let i = 0; i < times; i++) {
        const row = rows[i];
        const key = selectKey(row);
        if (storeService.get(world.store, key) !== undefined) continue;
        const slot = steps.mint(world, key);
        steps.assertWritable(world, slot);
        steps.write(world, slot, row);
        steps.updateEmptiness(world, slot);
        storeService.set(world.store, slot);
        steps.contentChanged(world, slot, row);
        steps.release(world, slot);
    }
    world.db.flush();
    priceSink.number = world.store.size;
};

const withAssert: TSteps = { ...HAND_STEPS, assertWritable: (world, slot) => world.probeInternals.slotOwnerService.assertWritable(slot) };
const withWrite: TSteps = {
    ...withAssert,
    write: (world, slot, row) => {
        world.probeInternals.writeEntityToSlot(slot, row, undefined);
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
    release: (world, slot) => world.probeInternals.slotOwnerService.releaseSlotIfUnheld(slot),
};
const withMint: TSteps = { ...withRelease, mint: probeMint };

const entityServiceDoor: TRung = (world, rows, times) => {
    const { entityService, entityStoreSlot } = world;
    for (let i = 0; i < times; i++) priceSink.ours = entityService.writeSlotContentByKey(entityStoreSlot, rows[i].id, rows[i]);
    world.db.flush();
};

const rungSide = (rung: TRung, rows: readonly TPriceDataRow[]): TPriceSide => {
    const db = new OIMDB();
    const entityService = createEntityService();
    const world: TWorld = {
        db,
        entityService,
        probeInternals: probeInternalsOf(entityService),
        entityStoreSlot: entityService.createStoreSlot(db),
        store: storeService.createStore(),
    };
    return {
        operationsPerPass: rows.length,
        reset: () => {
            world.entityService = createEntityService();
            world.probeInternals = probeInternalsOf(world.entityService);
            world.entityStoreSlot = world.entityService.createStoreSlot(db);
            world.store = storeService.createStore();
        },
        run: times => rung(world, rows, times),
    };
};

const LADDER =
    'One rung of a ladder from the insert path written by hand, step by step, around the shipped pieces, to '
    + 'entityService.writeSlotContentByKey on the same service. Every rung swaps exactly one hand-written step for the shipped piece\'s own '
    + 'method — the collection\'s slotOwnerService or the content service\'s private write methods, reached through a cast '
    + '(`as unknown as {…}`) — so the gap a rung shows is what that method '
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
const assertChain = chainOf(withAssert);
const writeChain = chainOf(withWrite);
const emptinessChain = chainOf(withEmptiness);
const contentChangedChain = chainOf(withContentChanged);
const releaseChain = chainOf(withRelease);
const mintChain = chainOf(withMint);

export const alternativePairsInsertDoorLadder: readonly TPricePair[] = [
    ladderPair('2-assert-writable', assertChain, 'assertWritable through the slot owner service',
        handChain, 'every step by hand', 'the slot owner service\'s assertWritable.'),
    ladderPair('3-write', writeChain, 'slotContentService.writeEntityToSlot',
        assertChain, 'the writer and the channel called by hand', 'writeEntityToSlot: the entity-undefined check, fillEntity, dispatchColumnsChanged and its column-store check.'),
    ladderPair('4-emptiness', emptinessChain, 'updateEntitySlotEmptiness through the content service and the slot owner service',
        writeChain, 'the step by hand', 'the slot owner service\'s settleEmptiness and settleWrite.'),
    ladderPair('5-content-changed', contentChangedChain, 'dispatchContentChange through the slot owner service',
        emptinessChain, 'no content-change call', 'the slot owner service\'s dispatchContentChange with no listener.'),
    ladderPair('6-release-check', releaseChain, 'releaseSlotIfUnheld through the slot owner service',
        contentChangedChain, 'the check by hand', 'the slot owner service\'s release check after the write.'),
    ladderPair('7-create-slot', mintChain, 'slotContentService.createSlot',
        releaseChain, 'createOIMEntitySlot called by hand', 'slotContentService.createSlot.'),
    ladderPair('8-door', entityServiceDoor, 'entityService.writeSlotContentByKey(storeSlot, id, entity)',
        mintChain, 'every step through the service\'s internal pieces, chained by hand',
        'writeSlotContentByKey itself: the store lookup, ownKey, createSlot, the isOnFastPath read and the fast-path insert, which on this fixture runs no dispatchContentChange and no release check and calls entityWriter.fillEntity directly, so the floor carries steps the door does not run.'),
];
