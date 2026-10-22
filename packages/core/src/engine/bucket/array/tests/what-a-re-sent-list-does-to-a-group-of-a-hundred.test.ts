import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import type { TOIMBucketSlot } from '../../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../../entity/types/TOIMEntityColumnName';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';

type TCard = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TGroup = TOIMBucketSlot<TSlots, string>;

const HUNDRED = 100;

const cardsOf = (db: OIMDB) => createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: card => card.id });
type TCardsService = ReturnType<typeof cardsOf>;
type TCardsStore = ReturnType<TCardsService['createStoreSlot']>;

const groupsOf = (db: OIMDB) => {
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
    const groupsService = createOIMBucketService<
        TCardSlot, string, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
    >(db, { slotContentService: membersService });
    return { groupsService, membersService };
};

const fill = (cardsService: TCardsService, cards: TCardsStore, size: number): TCardSlot[] => {
    const slots: TCardSlot[] = [];
    for (let i = 0; i < size; i++) {
        cardsService.slotContentService.upsertEntity(cards, { id: `r${i}`, rank: (i * 37) % size });
        slots.push(cardsService.getSlotByKey(cards, `r${i}`) as TCardSlot);
    }
    return slots;
};

const strangers = (cardsService: TCardsService, cards: TCardsStore, size: number): TCardSlot[] => {
    const slots: TCardSlot[] = [];
    for (let i = 0; i < size; i++) {
        cardsService.slotContentService.upsertEntity(cards, { id: `s${i}`, rank: 1000 + ((i * 37) % size) });
        slots.push(cardsService.getSlotByKey(cards, `s${i}`) as TCardSlot);
    }
    return slots;
};

const idsOf = (slots: Iterable<TOIMEntitySlot<TCard>>): string[] =>
    [...slots].map(slot => (slot.entity as TCard).id);

type TListTally = { indexReads: number; indexWrites: number; lengthWrites: number };

const isIndexName = (property: string | symbol): boolean =>
    typeof property === 'string' && /^\d+$/.test(property);

const watchList = (bucket: TGroup): TListTally => {
    const tally: TListTally = { indexReads: 0, indexWrites: 0, lengthWrites: 0 };
    const list = bucket.bucketSlotsStore.bucketMemberSlots;
    bucket.bucketSlotsStore.bucketMemberSlots = new Proxy(list, {
        get(target, property) {
            if (isIndexName(property)) tally.indexReads++;
            return Reflect.get(target, property);
        },
        set(target, property, value) {
            if (isIndexName(property)) tally.indexWrites++;
            else if (property === 'length') tally.lengthWrites++;
            return Reflect.set(target, property, value);
        },
    });
    return tally;
};

const filledHundred = () => {
    const db = new OIMDB();
    const cardsService = cardsOf(db);
    const cards = cardsService.createStoreSlot(db);
    const { groupsService, membersService } = groupsOf(db);
    const slots = fill(cardsService, cards, HUNDRED);
    const groups = groupsService.createStoreSlot(db);
    const bucket = groupsService.holdSlotByKey(groups, 'group');
    membersService.writeBucketMemberSlots(bucket, slots);
    expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(idsOf(slots));
    return { cardsService, cards, membersService, bucket, slots };
};

describe('a whole-list write that changes one entity of a group of a hundred', () => {
    it('keeps every slot that stayed held, and lets the one that left go', () => {
        const { cardsService, cards, membersService, bucket, slots } = filledHundred();
        const leaving = slots[0];
        const staying = slots.slice(1);
        cardsService.slotContentService.upsertEntity(cards, { id: 'joiner', rank: 44.5 });
        const joiner = cardsService.getSlotByKey(cards, 'joiner') as TCardSlot;

        membersService.writeBucketMemberSlots(bucket, [...staying, joiner]);

        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(idsOf([...staying, joiner]));
        expect(leaving.holdCount).toBe(0);
        expect(joiner.holdCount).toBe(1);
        expect(staying.every(slot => slot.holdCount === 1)).toBe(true);
    });

    it('counts a repeat rather than reading the two lists as sets', () => {
        const db = new OIMDB();
        const cardsService = cardsOf(db);
        const cards = cardsService.createStoreSlot(db);
        const { groupsService, membersService } = groupsOf(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 1 });
        cardsService.slotContentService.upsertEntity(cards, { id: 'b', rank: 2 });
        const a = cardsService.getSlotByKey(cards, 'a') as TCardSlot;
        const b = cardsService.getSlotByKey(cards, 'b') as TCardSlot;
        const groups = groupsService.createStoreSlot(db);
        const bucket = groupsService.holdSlotByKey(groups, 'group');

        membersService.writeBucketMemberSlots(bucket, [a, a, b]);
        membersService.writeBucketMemberSlots(bucket, [a, b, b]);

        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['a', 'b', 'b']);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(3);
        expect(a.holdCount).toBe(1);
        expect(b.holdCount).toBe(2);
    });

    it('leaves a list verbatim where the caller places it, repeats and all', () => {
        const db = new OIMDB();
        const cardsService = cardsOf(db);
        const cards = cardsService.createStoreSlot(db);
        const { groupsService, membersService } = groupsOf(db);
        for (const id of ['k1', 'k2', 'k3']) cardsService.slotContentService.upsertEntity(cards, { id, rank: 0 });
        const k1 = cardsService.getSlotByKey(cards, 'k1') as TCardSlot;
        const k2 = cardsService.getSlotByKey(cards, 'k2') as TCardSlot;
        const k3 = cardsService.getSlotByKey(cards, 'k3') as TCardSlot;
        const groups = groupsService.createStoreSlot(db);
        const bucket = groupsService.holdSlotByKey(groups, 'group');

        membersService.writeBucketMemberSlots(bucket, [k1, k3, k2, k3]);
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['k1', 'k3', 'k2', 'k3']);
        expect(k3.holdCount).toBe(2);

        membersService.writeBucketMemberSlots(bucket, [k3, k1, k3, k2]);
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['k3', 'k1', 'k3', 'k2']);
        expect(k3.holdCount).toBe(2);
    });
});

describe('the eviction a whole-list write takes', () => {
    it('empties a group of a hundred without writing one element', () => {
        const { membersService, bucket } = filledHundred();
        const tally = watchList(bucket);

        membersService.writeBucketMemberSlots(bucket, []);

        expect(tally.indexWrites).toBe(0);
        expect(tally.lengthWrites).toBe(1);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(0);
    });

    it('replaces every slot in a group of a hundred for exactly a hundred element writes', () => {
        const { cardsService, cards, membersService, bucket } = filledHundred();
        const arriving = strangers(cardsService, cards, HUNDRED);
        const tally = watchList(bucket);

        membersService.writeBucketMemberSlots(bucket, arriving);

        expect(tally.indexWrites).toBe(HUNDRED);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(HUNDRED);
    });
});
