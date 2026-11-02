import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { createOIMSlotCollectionStoreAggregate } from '../createOIMSlotCollectionStoreAggregate';
import { createOIMSingleSlotStoreAggregate } from '../createOIMSingleSlotStoreAggregate';
import { OIMWritableSlotCollectionStoreAggregate } from '../OIMWritableSlotCollectionStoreAggregate';
import { OIMWritableSingleSlotStoreAggregate } from '../OIMWritableSingleSlotStoreAggregate';
import { OIMSlotCollectionStoreAggregate } from '../OIMSlotCollectionStoreAggregate';
import { OIMWritableSlotCollectionService } from '../OIMWritableSlotCollectionService';
import { createOIMSortedComputedService } from '../../computed/createOIMSortedComputedService';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';

type TCard = { id: string; title: string };
type TSession = { userId: string };

describe('what a store aggregate does', () => {
    it('a collection aggregate answers with the slots of its store slot', () => {
        const db = new OIMDB();
        const cardSlotService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cardStoreSlot = cardSlotService.createStoreSlot(db);
        const cardStoreAggregate = cardSlotService.createStoreAggregate(cardStoreSlot);

        const slot = cardStoreAggregate.writeSlotContentByKey('c1', { id: 'c1', title: 'Ace' });

        expect(cardStoreAggregate).toBeInstanceOf(OIMWritableSlotCollectionStoreAggregate);
        expect(cardStoreAggregate.storeSlot).toBe(cardStoreSlot);
        expect(cardStoreAggregate.slotService).toBe(cardSlotService);
        expect(cardStoreAggregate.slotContentService).toBe(cardSlotService.slotContentService);
        expect(cardSlotService.findSlotByKey(cardStoreSlot, 'c1')).toBe(slot);
        expect(cardStoreAggregate.getSlotByKey('c1')).toBe(slot);
        expect(cardStoreAggregate.findSlotByKey('c2')).toBeUndefined();
        expect(cardStoreAggregate.hasSlotContentByKey('c1')).toBe(true);
        expect(cardStoreAggregate.getSlotCount()).toBe(1);
        expect(Array.from(cardStoreAggregate.getSlots())).toEqual([slot]);
    });

    it('a write through the aggregate wakes an effect at the flush, and a batch is one delivery', () => {
        const db = new OIMDB();
        const cardStoreAggregate = createOIMSlotCollectionStoreAggregate(db, {
            slotContentService: createOIMEntityContentService<TCard>(),
        });
        const slot = cardStoreAggregate.holdSlotByKey('c1');
        const titles: string[] = [];
        OIMEffectService.INSTANCE.createEffect(db, () => { titles.push(slot.entity?.title ?? ''); }, [slot]);

        cardStoreAggregate.writeInBatch(() => {
            cardStoreAggregate.writeSlotContentByKey('c1', { id: 'c1', title: 'Ace' });
            cardStoreAggregate.slotContentService.updateEntity(slot, { title: 'Ace of Spades' });
        });
        db.flush();

        expect(titles).toEqual(['Ace of Spades']);
    });

    it('a single aggregate writes, reads and clears its one slot', () => {
        const db = new OIMDB();
        const sessionStoreAggregate = createOIMSingleSlotStoreAggregate(db, {
            slotContentService: createOIMEntityContentService<TSession>(),
        });

        const slot = sessionStoreAggregate.writeSingleSlotContent({ userId: 'u1' });

        expect(sessionStoreAggregate).toBeInstanceOf(OIMWritableSingleSlotStoreAggregate);
        expect(sessionStoreAggregate.getSingleSlot()).toBe(slot);
        expect(sessionStoreAggregate.findSingleSlot()).toBe(slot);
        expect(sessionStoreAggregate.hasSingleSlotContent()).toBe(true);
        expect(sessionStoreAggregate.slotService.findSingleSlot(sessionStoreAggregate.storeSlot)).toBe(slot);

        sessionStoreAggregate.clearSingleSlotContent();

        expect(sessionStoreAggregate.hasSingleSlotContent()).toBe(false);
    });

    it('opens and closes a batch on its store slot, and holds its single slot', () => {
        const db = new OIMDB();
        const cardStoreAggregate = createOIMSlotCollectionStoreAggregate(db, {
            slotContentService: createOIMEntityContentService<TCard>(),
        });
        const sessionStoreAggregate = createOIMSingleSlotStoreAggregate(db, {
            slotContentService: createOIMEntityContentService<TSession>(),
        });

        cardStoreAggregate.openBatch();
        cardStoreAggregate.writeSlotContentByKey('c1', { id: 'c1', title: 'Ace' });
        cardStoreAggregate.closeBatch();
        const session = sessionStoreAggregate.holdSingleSlot();

        expect(cardStoreAggregate.hasSlotContentByKey('c1')).toBe(true);
        expect(() => { cardStoreAggregate.closeBatch(); }).toThrow();
        expect(session.holdCount).toBe(1);
        expect(sessionStoreAggregate.slotContentService).toBe(sessionStoreAggregate.slotService.slotContentService);
    });

    it('offers a batch only where it can write: a computed collection has none', () => {
        const sortedService = createOIMSortedComputedService({
            indexService: createOIMSlotCollectionIndexService({
                entityService: createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<{ id: string; rank: number }>() }),
                columns: ['rank'],
            }),
            sortColumns: [{ columnName: 'rank', direction: 'asc' }],
        });
        const sortedServiceObject: object = sortedService;
        const readOnlyAggregatePrototype: object = OIMSlotCollectionStoreAggregate.prototype;
        for (const batchDoor of ['openBatch', 'closeBatch', 'writeInBatch']) {
            expect(batchDoor in sortedServiceObject).toBe(false);
            expect(batchDoor in readOnlyAggregatePrototype).toBe(false);
            expect(batchDoor in OIMWritableSlotCollectionStoreAggregate.prototype).toBe(true);
            expect(batchDoor in OIMWritableSlotCollectionService.prototype).toBe(true);
        }
    });
});
