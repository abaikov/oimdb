import { OIMDB } from '../../../db/OIMDB';
import { OIMSlotContentPositionalArrayBucketService } from '../../OIMSlotContentPositionalArrayBucketService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../slot/createOIMSlotCollectionService';

type TCard = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, string>;

const cardsOf = (db: OIMDB) => createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });

const groupsOf = (db: OIMDB) => {
    const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot, string>();
    const groupsService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    return { groupsService, membersService };
};

const idsOf = (slots: Iterable<TOIMEntitySlot<TCard>>): string[] =>
    [...slots].map(slot => (slot.entity as TCard).id);

describe('a whole-list write that changes one entity of a group of a hundred', () => {

    it('counts a repeat rather than reading the two lists as sets', () => {
        const db = new OIMDB();
        const cardsService = cardsOf(db);
        const cards = cardsService.createStoreSlot(db);
        const { groupsService, membersService } = groupsOf(db);
        cardsService.writeSlotContentByKey(cards, (card => card.id)({ id: 'a', rank: 1 }), { id: 'a', rank: 1 });
        cardsService.writeSlotContentByKey(cards, (card => card.id)({ id: 'b', rank: 2 }), { id: 'b', rank: 2 });
        const a = cardsService.getSlotByKey(cards, 'a') as TCardSlot;
        const b = cardsService.getSlotByKey(cards, 'b') as TCardSlot;
        const groups = groupsService.createStoreSlot(db);
        const bucket = groupsService.holdSlotByKey(groups, 'group');

        membersService.writeSlotContent(bucket, [a, a, b]);
        membersService.writeSlotContent(bucket, [a, b, b]);

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
        for (const id of ['k1', 'k2', 'k3']) cardsService.writeSlotContentByKey(cards, (card => card.id)({ id, rank: 0 }), { id, rank: 0 });
        const k1 = cardsService.getSlotByKey(cards, 'k1') as TCardSlot;
        const k2 = cardsService.getSlotByKey(cards, 'k2') as TCardSlot;
        const k3 = cardsService.getSlotByKey(cards, 'k3') as TCardSlot;
        const groups = groupsService.createStoreSlot(db);
        const bucket = groupsService.holdSlotByKey(groups, 'group');

        membersService.writeSlotContent(bucket, [k1, k3, k2, k3]);
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['k1', 'k3', 'k2', 'k3']);
        expect(k3.holdCount).toBe(2);

        membersService.writeSlotContent(bucket, [k3, k1, k3, k2]);
        expect(idsOf(membersService.getBucketMemberSlots(bucket))).toEqual(['k3', 'k1', 'k3', 'k2']);
        expect(k3.holdCount).toBe(2);
    });
});
