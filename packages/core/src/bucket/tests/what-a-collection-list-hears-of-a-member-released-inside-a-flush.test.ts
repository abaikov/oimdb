import { OIMDB } from '../../db/OIMDB';
import { OIMSlotCollectionBucketService } from '../OIMSlotCollectionBucketService';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';
import { createOIMEntitySlotCollectionStoreAggregate } from '../../entity/createOIMEntitySlotCollectionStoreAggregate';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

describe('what a collection list hears of a member released inside a flush', () => {
    it('drops a written member the flush gives back, and its reader sees the list without it', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE });
        const ace = cards.holdSlotByKey('a');
        ace.writeSlotContent({ id: 'a', title: 'Ace' });
        const lists: string[][] = [];
        db.createEffect(() => {
            const keys: string[] = [];
            for (const card of OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(cards.storeSlot).getBucketMemberSlots()) keys.push(card.key as string);
            lists.push(keys.sort());
        });
        db.flush();
        const two = cards.getSlotByKey('b');
        two.writeSlotContent({ id: 'b', title: 'Two' });
        db.flush();
        db.flush();
        expect(oimIsSlotReleased(two)).toBe(true);
        expect(lists[lists.length - 1]).toEqual(['a']);
        expect([...OIMSlotCollectionBucketService.INSTANCE.getBucketSlot(cards.storeSlot).getBucketMemberSlots()]).toEqual([ace]);
    });
});
