import { OIMDB } from '../../db/OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../slot/createOIMSlotCollectionStoreAggregate';
import { createOIMSlotCollectionSortedArrayIndexService } from '../../index/createOIMSlotCollectionSortedArrayIndexService';
import { OIMBucketCommands } from '../OIMBucketCommands';

type TCard = { id: string; deck: string; rank: number };

describe('what a sorted bucket records for its view', () => {
    it('records every change as the whole list, never a position that the next sort could move', () => {
        const db = new OIMDB();
        const cards = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TCard>() });
        cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', rank: 2 });
        db.flush();
        const byDeckService = createOIMSlotCollectionSortedArrayIndexService({
            entityService: cards.slotService, columns: ['deck'],
            sortColumns: [{ columnName: 'rank', direction: 'asc' }],
            bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards.storeSlot);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        const scripts: { isWholeListRecorded: boolean; commandCount: number }[] = [];
        const dispose = spades.watch(bucketSlot => {
            scripts.push({ isWholeListRecorded: bucketSlot.isWholeListRecorded, commandCount: bucketSlot.commands?.length ?? 0 });
        });

        cards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', rank: 1 });
        db.flush();
        dispose();

        expect(scripts[scripts.length - 1]).toEqual({ isWholeListRecorded: true, commandCount: 0 });
        expect([...spades.getBucketMemberSlots()].map(member => member.entity?.id)).toEqual(['c2', 'c1']);
    });

    it('records the whole list when a sort-column edit moves a member', () => {
        const db = new OIMDB();
        const cards = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TCard>() });
        cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', rank: 1 });
        cards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', rank: 2 });
        db.flush();
        const byDeckService = createOIMSlotCollectionSortedArrayIndexService({
            entityService: cards.slotService, columns: ['deck'],
            sortColumns: [{ columnName: 'rank', direction: 'asc' }],
            bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards.storeSlot);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        db.flush();
        const scripts: boolean[] = [];
        const dispose = spades.watch(bucketSlot => { scripts.push(bucketSlot.isWholeListRecorded); });

        cards.slotContentService.updateEntity(cards.getSlotByKey('c1'), { rank: 3 });
        db.flush();
        dispose();

        expect(scripts).toEqual([false, true]);
        expect([...spades.getBucketMemberSlots()].map(member => member.entity?.id)).toEqual(['c2', 'c1']);
    });
});
