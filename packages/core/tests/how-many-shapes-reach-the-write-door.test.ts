import { OIMBucketCommands } from '../src/bucket/OIMBucketCommands';
import { OIMSlotContentPositionalArrayBucketService } from '../src/bucket/OIMSlotContentPositionalArrayBucketService';
import { OIMChannelService } from '../src/channel/OIMChannelService';
import { OIMEffectService } from '../src/effect/OIMEffectService';
import { OIMSlotOwner } from '../src/slot/OIMSlotOwner';
import { OIMDB } from '../src/db/OIMDB';
import { createOIMComputedService } from '../src/computed/createOIMComputedService';
import { oimSameValueZeroGuard } from '../src/slot/utils/oimSameValueZeroGuard';
import type { TOIMChannelSlot } from '../src/channel/types/TOIMChannelSlot';
import type { TOIMEntitySlot } from '../src/entity/types/TOIMEntitySlot';
import type { TOIMSlot } from '../src/slot/types/TOIMSlot';
import { createOIMSlotContentEntityService } from '../src/entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../src/slot/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../src/slot/createOIMSingleSlotService';

/**
 * HOW MANY HIDDEN CLASSES REACH THE WRITE DOOR, AND WHERE THE THREE FIELDS IT
 * TOUCHES SIT IN EACH OF THEM. The ceiling it answers to: V8's megamorphic
 * ceiling of four.
 *
 * `writeWithoutFlushCheck` reads `effects` and reads-then-writes
 * `changedAtRevision` and `changedAtEpoch`. Nothing else of the slot. So the
 * census records, per arriving shape, the INDEX of those three in the object's
 * own-key order — a proxy for the field offset, and the thing that decides
 * whether the arrivals can share one load at all.
 *
 * The proxy's limits, stated because the number below is quoted elsewhere:
 * own-key order is not the hidden class. V8 also splits a map on a field's
 * REPRESENTATION (smi against double against tagged) and on an out-of-object
 * properties backing store, and it does not publish either through
 * `Object.keys`. Two arrivals that agree here can still be two maps; two that
 * disagree are certainly two. The count is therefore a FLOOR on the shapes at
 * the site, never a ceiling — which is the direction the ceiling argument needs.
 */

type TCard = { id: string; title: string; rank: number };

const DOOR_READS_AND_STAMPS: readonly string[] = ['effects', 'changedAtRevision', 'changedAtEpoch', 'holdCount'];

const WHERE_THE_DOORS_FIELDS_SIT = [0, 1, 2, 4];

type TArrivingShape = {
    label: string;
    keyCount: number;
    whereTheDoorsFieldsSit: number[];
};

const shapeOf = (arrival: object): TArrivingShape => {
    const keys = Object.keys(arrival);
    const constructorName = arrival.constructor.name;
    const tail = keys.filter(
        key => !DOOR_READS_AND_STAMPS.includes(key)
            && !['releaseDueAfterWriteMs', 'releaseDueAfterIdleMs', 'releaseDueAfterUnholdMs', 'slotFlags', 'storeSlot', 'owner', 'key'].includes(key),
    );
    return {
        label: constructorName === 'Object' ? `literal{${tail.join(',')}}` : constructorName,
        keyCount: keys.length,
        whereTheDoorsFieldsSit: DOOR_READS_AND_STAMPS.map(field => keys.indexOf(field)),
    };
};

const census = (): { shapes: Map<string, TArrivingShape>; note: (arrival: object) => void } => {
    const shapes = new Map<string, TArrivingShape>();
    return {
        shapes,
        note: (arrival: object): void => {
            const keys = Object.keys(arrival);
            shapes.set(`${arrival.constructor.name}|${keys.join(',')}`, shapeOf(arrival));
        },
    };
};

const spyOnTheDoor = (defaultChannelSlot: TOIMChannelSlot) => {
    const arrivals = census();
    const write = OIMChannelService.prototype.write;
    const writeWithoutFlushCheck = OIMChannelService.prototype.writeWithoutFlushCheck;
    jest.spyOn(OIMChannelService.INSTANCE, 'write').mockImplementation(function (
        this: OIMChannelService, channelSlot: TOIMChannelSlot, slot: TOIMSlot,
    ): void {
        if (channelSlot === defaultChannelSlot) arrivals.note(slot);
        write.call(this, channelSlot, slot);
    });
    jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck').mockImplementation(function (
        this: OIMChannelService, channelSlot: TOIMChannelSlot, slot: TOIMSlot,
    ): void {
        if (channelSlot === defaultChannelSlot) arrivals.note(slot);
        writeWithoutFlushCheck.call(this, channelSlot, slot);
    });
    return arrivals;
};

/** Every door of the engine driven once, so no arrival depends on which call the test happened to make. */
const driveEveryDoor = (db: OIMDB) => {
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const deckService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot<TCard>>({
            bucketCommands: new OIMBucketCommands({}),
        }) });
    const deck = deckService.createStoreSlot(db);
    const singleService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const single = singleService.createStoreSlot(db);
    singleService.writeSingleSlotContent(single, { id: 'solo', title: 'solo', rank: 0 });
    const singleSlot = singleService.holdSingleSlot(single);
    const doubledService = createOIMComputedService<string, number>({
        sameValueGuard: oimSameValueZeroGuard,
    });
    const doubled = doubledService.createComputedStoreSlot(
        db,
        computedSlot => (cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0) * 2,
        ({ key: id }) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
    );
    const doubledCollectionService = doubledService.computedCollectionService;

    const bucket = deckService.holdSlotByKey(deck, 'deck');

    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'first', rank: 1 });
    cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', title: 'second', rank: 2 });
    db.flush();

    const a = cardsService.getSlotByKey(cards, 'a');
    cardsService.columnSlotService.holdColumn(a, 'title');
    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'renamed', rank: 1 });
    db.flush();

    deckService.slotContentService.writeSlotContent(bucket, [a, cardsService.getSlotByKey(cards, 'b')]);
    db.flush();

    deckService.slotContentService.removeBucketMemberSlots(bucket, [a]);
    db.flush();

    singleService.slotContentService.updateEntity(singleSlot, { title: 'renamed too' });
    db.flush();

    const derived = doubledCollectionService.holdSlotByKey(doubled, 'a');
    doubledCollectionService.columnSlotService.holdAnyColumn(derived);
    OIMEffectService.INSTANCE.createEffect(db, () => { void derived.computedValueService.getValueForSlot(derived); }, [], [derived]);
    OIMEffectService.INSTANCE.createEffect(db, () => { void cardsService.getSlotCount(cards); }, [cardsService.getSlotByKey(cards, 'b')]);
    OIMEffectService.INSTANCE.createEffect(db, () => { void singleSlot.entity; }, [singleSlot]);
    db.flush();
    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'renamed', rank: 9 });
    db.flush();

    return { cards, deck, single, derived };
};

const V8_POLYMORPHIC_CEILING = 4;

const THREE_SLOT_LITERALS: TArrivingShape[] = [
    { label: 'literal{effectEdges,columnSlotStore,carrierSlot}', keyCount: 14, whereTheDoorsFieldsSit: WHERE_THE_DOORS_FIELDS_SIT },
    {
        label: 'literal{effectEdges,columnSlotStore,indexKeys,bucketSlotsStore,commands,isWholeListRecorded,commandsStartedAtRevision,commandsStartedAtEpoch}',
        keyCount: 19,
        whereTheDoorsFieldsSit: WHERE_THE_DOORS_FIELDS_SIT,
    },
    {
        label: 'literal{effectEdges,entity,columnSlotStore,data,indexKeys}',
        keyCount: 16,
        whereTheDoorsFieldsSit: WHERE_THE_DOORS_FIELDS_SIT,
    },
];

const COMPUTED_SLOT_LITERAL: TArrivingShape = {
    label: 'literal{effectEdges,columnSlotStore,computedValueService,indexKeys,sourceSlots,sourceComputeds,value,'
        + 'ranAtRevision,ranAtEpoch,checkedAtRevision,checkedAtEpoch,isDeriving,allRootSlots,sourceTracker}',
    keyCount: 25,
    whereTheDoorsFieldsSit: WHERE_THE_DOORS_FIELDS_SIT,
};

const byLabel = (shapes: Iterable<TArrivingShape>): TArrivingShape[] => Array.from(shapes)
    .sort((left, right) => left.label.localeCompare(right.label));

describe('how many shapes reach the write door', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('names every hidden class the stamping door is asked to stamp', () => {
        const db = new OIMDB();
        const doorArrivals = spyOnTheDoor(db.defaultChannelSlot);

        driveEveryDoor(db);

        expect(byLabel(doorArrivals.shapes.values())).toEqual(byLabel(THREE_SLOT_LITERALS));
    });

    it('names every hidden class hold and unhold are asked to count', () => {
        const db = new OIMDB();
        const arrivals = census();
        const hold = OIMSlotOwner.prototype.holdSlot;
        const unhold = OIMSlotOwner.prototype.unholdSlot;
        OIMSlotOwner.prototype.holdSlot = function countingHold(slot: TOIMSlot): void {
            arrivals.note(slot);
            hold.call(this, slot);
        };
        OIMSlotOwner.prototype.unholdSlot = function countingUnhold(slot: TOIMSlot): void {
            arrivals.note(slot);
            unhold.call(this, slot);
        };
        try {
            driveEveryDoor(db);
        } finally {
            OIMSlotOwner.prototype.holdSlot = hold;
            OIMSlotOwner.prototype.unholdSlot = unhold;
        }

        expect(byLabel(arrivals.shapes.values()))
            .toEqual(byLabel([...THREE_SLOT_LITERALS, COMPUTED_SLOT_LITERAL]));
    });

    it('the door stands below the ceiling, hold at it, and every arrival agrees on the offsets', () => {
        const db = new OIMDB();
        const doorArrivals = spyOnTheDoor(db.defaultChannelSlot);
        const arrivals = census();
        const hold = OIMSlotOwner.prototype.holdSlot;
        OIMSlotOwner.prototype.holdSlot = function countingHold(slot: TOIMSlot): void {
            arrivals.note(slot);
            hold.call(this, slot);
        };
        try {
            driveEveryDoor(db);
        } finally {
            OIMSlotOwner.prototype.holdSlot = hold;
        }

        expect(doorArrivals.shapes.size).toBe(V8_POLYMORPHIC_CEILING - 1);
        expect(arrivals.shapes.size).toBe(V8_POLYMORPHIC_CEILING);

        const disagreeingOnWhereTheFieldsSit = byLabel(doorArrivals.shapes.values())
            .filter(shape => shape.whereTheDoorsFieldsSit.join() !== WHERE_THE_DOORS_FIELDS_SIT.join())
            .map(shape => shape.label);

        expect(disagreeingOnWhereTheFieldsSit).toEqual([]);
    });
});
