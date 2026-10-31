import { OIMDB } from '../../../db/OIMDB';
import { OIMPositionalArrayBucketContentService } from '../../OIMPositionalArrayBucketContentService';
import { OIMBucketCommands } from '../../OIMBucketCommands';
import { OIMBucketUniqueMemberSlotsArrayService } from '../OIMBucketUniqueMemberSlotsArrayService';
import { OIMChannelService } from '../../../channel/OIMChannelService';
import { applyOrderedListCommands } from '../../../../tests/support/orderedListConsumer';
import type { TOIMBucketSlot } from '../../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';
import { createOIMEntityContentService } from '../../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../../slot/createOIMSlotCollectionService';
import { bucketSlotsStoreOf } from '../../../../tests/support/bucketSlotsStoreOf';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;

type TListTally = { indexReads: number; indexWrites: number };

const isIndexName = (property: string | symbol): boolean =>
    typeof property === 'string' && /^\d+$/.test(property);

const watch = (bucket: TBucket): TListTally => {
    const tally: TListTally = { indexReads: 0, indexWrites: 0 };
    bucketSlotsStoreOf<TCardSlot>(bucket).bucketMemberSlots = new Proxy(bucketSlotsStoreOf<TCardSlot>(bucket).bucketMemberSlots, {
        get(target, property) {
            if (isIndexName(property)) tally.indexReads++;
            return Reflect.get(target, property);
        },
        set(target, property, value) {
            if (isIndexName(property)) tally.indexWrites++;
            return Reflect.set(target, property, value);
        },
    });
    return tally;
};

const createFixture = (isUnique = false) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, TOIMStoreKey>() });
    const cards = cardsService.createStoreSlot(db);
    const bucketCommands = new OIMBucketCommands({});
    const membersService = isUnique
        ? new OIMPositionalArrayBucketContentService<TCardSlot>({ bucketCommands, bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService() }) as OIMPositionalArrayBucketContentService<TCardSlot>
        : new OIMPositionalArrayBucketContentService<TCardSlot>({ bucketCommands });
    const listService = createOIMSlotCollectionService({ slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TCardSlot => {
        cardsService.writeSlotContentByKey(cards, id, { id });
        return cardsService.holdSlotByKey(cards, id);
    };
    const drawn: TCardSlot[] = [];
    OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
        if (bucket.isWholeListRecorded) {
            drawn.length = 0;
            for (const slot of membersService.getBucketMemberSlots(bucket)) drawn.push(slot);
            return;
        }
        applyOrderedListCommands(drawn, bucket.commands ?? []);
    });
    return { db, membersService, bucket, slotOf, drawn };
};

const filled = (size: number, isUnique = false) => {
    const built = createFixture(isUnique);
    const slots: TCardSlot[] = [];
    for (let i = 0; i < size; i++) slots.push(built.slotOf(`r${i}`));
    built.membersService.addBucketMemberSlots(built.bucket, slots);
    built.db.flush();
    return { ...built, slots };
};

const ids = (of: Iterable<TCardSlot>): string[] => Array.from(of, slot => slot.entity?.id ?? '?');

describe('what taking many slots out of an ordered bucket at once touches', () => {
    it.each([
        ['the front', 0],
        ['the back', 900],
    ])('takes 100 of 1000 from %s for one pass over the list', (_, first) => {
        const { membersService, bucket, slots } = filled(1000);
        const leaving = slots.slice(first, first + 100);
        const tally = watch(bucket);

        membersService.removeBucketMemberSlots(bucket, leaving);

        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(900);
        expect(tally.indexReads + tally.indexWrites).toBeLessThanOrEqual(2 * 1000 + 100);
    });

    it('hands a consumer commands that replay to the same list, whatever order the slots were named in', () => {
        const { db, membersService, bucket, slots, drawn } = filled(10);
        const leaving = [slots[7], slots[2], slots[9], slots[0], slots[5]];

        membersService.removeBucketMemberSlots(bucket, leaving);
        db.flush();

        expect(ids(membersService.getBucketMemberSlots(bucket))).toEqual(['r1', 'r3', 'r4', 'r6', 'r8']);
        expect(ids(drawn)).toEqual(['r1', 'r3', 'r4', 'r6', 'r8']);
    });

    it('takes one occurrence per naming out of a list that holds a slot more than once, from the front', () => {
        const { db, membersService, bucket, slotOf, drawn } = createFixture();
        const a = slotOf('a');
        const b = slotOf('b');
        const c = slotOf('c');
        membersService.addBucketMemberSlots(bucket, [a, b, a, c, a]);
        db.flush();

        membersService.removeBucketMemberSlots(bucket, [a, a]);
        db.flush();

        expect(ids(membersService.getBucketMemberSlots(bucket))).toEqual(['b', 'c', 'a']);
        expect(ids(drawn)).toEqual(['b', 'c', 'a']);
    });

    it('gives back one hold per slot it took out and none for a slot it does not hold', () => {
        const { membersService, bucket, slots, slotOf } = filled(5);
        const stranger = slotOf('stranger');
        const unholdSlot = jest.spyOn(slots[0].owner, 'unholdSlot');

        membersService.removeBucketMemberSlots(bucket, [slots[3], stranger, slots[1]]);

        expect(unholdSlot).toHaveBeenCalledTimes(2);
        expect(ids(membersService.getBucketMemberSlots(bucket))).toEqual(['r0', 'r2', 'r4']);
    });

    it('forgets what a unique bucket took out, so the same slot can come back', () => {
        const { membersService, bucket, slots } = filled(4, true);

        membersService.removeBucketMemberSlots(bucket, [slots[2], slots[0]]);
        membersService.addBucketMemberSlots(bucket, [slots[0]]);

        expect(ids(membersService.getBucketMemberSlots(bucket))).toEqual(['r1', 'r3', 'r0']);
        expect(bucketSlotsStoreOf<TCardSlot>(bucket).uniqueBucketMemberSlots!.has(slots[2])).toBe(false);
    });
});
