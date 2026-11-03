import { OIMPositionalArrayBucketContentService } from '../OIMPositionalArrayBucketContentService';
import { OIMDB } from '../../db/OIMDB';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const releasedBucket = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const listsService = createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TCardSlot>() });
    const cards = cardsService.createStoreSlot(db);
    const lists = listsService.createStoreSlot(db);
    cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A' });
    db.flush();
    const card = cardsService.getSlotByKey(cards, 'a');

    const bucket = listsService.getSlotByKey(lists, 'deck');
    db.flush();
    OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

    return { db, listsService, lists, card, bucket };
};

describe('a bucket the engine already let go', () => {
    it('is released by the turn that only read it, which is what the rest of this file rests on', () => {
        const w = releasedBucket();
        expect(isOIMSlotReleased(w.bucket)).toBe(true);
        expect(w.listsService.getSlotCount(w.lists)).toBe(0);
    });

    it('refuses insertSlotAt, and takes no hold on the slot it was handed', () => {
        const w = releasedBucket();

        expect(() => { w.listsService.slotContentService.insertBucketMemberSlotAt(w.bucket, 0, w.card); }).toThrow('This identity was released');
        expect(w.card.holdCount).toBe(0);
        expect(w.listsService.slotContentService.getBucketMemberSlotCount(w.bucket)).toBe(0);
    });

    it('refuses moveSlotToPosition and moveSlotRangeToPosition', () => {
        const w = releasedBucket();

        expect(() => { w.listsService.slotContentService.moveBucketMemberSlotToPosition(w.bucket, 0, 1); })
            .toThrow('This identity was released');
        expect(() => { w.listsService.slotContentService.moveBucketMemberSlotRangeToPosition(w.bucket, 0, 1, 1); })
            .toThrow('This identity was released');
    });

    it('refuses every removal door', () => {
        const w = releasedBucket();

        expect(() => { w.listsService.slotContentService.removeBucketMemberSlots(w.bucket, [w.card]); }).toThrow('This identity was released');
        expect(() => { w.listsService.slotContentService.removeBucketMemberSlotAt(w.bucket, 0); }).toThrow('This identity was released');
        expect(() => { w.listsService.slotContentService.removeBucketMemberSlotRange(w.bucket, 0, 1); }).toThrow('This identity was released');
        expect(() => { w.listsService.slotContentService.clearSlotContent(w.bucket); }).toThrow('This identity was released');
    });

    it('refuses it through the base door too, and that one always did', () => {
        const w = releasedBucket();

        expect(() => { w.listsService.slotContentService.writeSlotContent(w.bucket, [w.card]); }).toThrow('This identity was released');
        expect(() => { w.listsService.slotContentService.addBucketMemberSlots(w.bucket, [w.card]); }).toThrow('This identity was released');
        expect(w.card.holdCount).toBe(0);
    });
});
