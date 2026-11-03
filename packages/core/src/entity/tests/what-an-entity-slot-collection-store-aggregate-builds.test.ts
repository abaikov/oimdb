import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMEntityContentService } from '../OIMEntityContentService';
import { OIMWritableSlotCollectionStoreAggregate } from '../../slot/OIMWritableSlotCollectionStoreAggregate';
import { createOIMEntitySlotCollectionStoreAggregate } from '../createOIMEntitySlotCollectionStoreAggregate';
import { createOIMReplacingEntityWriter } from '../createOIMReplacingEntityWriter';

type TCard = { id: string; title: string; rank: number };

describe('what an entity slot collection store aggregate builds', () => {
    it('is a writable collection aggregate over an entity content service, from the entity type alone', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);

        const ace = cards.writeSlotContentByKey('c1', { id: 'c1', title: 'Ace', rank: 1 });
        ace.updateEntity({ rank: 14 });

        expect(cards).toBeInstanceOf(OIMWritableSlotCollectionStoreAggregate);
        expect(cards.slotContentService).toBeInstanceOf(OIMEntityContentService);
        expect(cards.getSlotByKey('c1')).toBe(ace);
        expect(ace.entity).toEqual({ id: 'c1', title: 'Ace', rank: 14 });
    });

    it('delivers a write to an effect on the slot', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        const ace = cards.writeSlotContentByKey('c1', { id: 'c1', title: 'Ace', rank: 1 });
        const seenTitles: string[] = [];
        const dispose = OIMEffectService.INSTANCE.subscribeEffect(db, () => { seenTitles.push(ace.entity?.title ?? ''); }, [ace]);

        ace.updateEntity({ title: 'Ace of Spades' });
        db.flush();
        dispose();

        expect(seenTitles).toEqual(['Ace of Spades']);
    });

    it('hands the entity options to the content service and the collection options to the collection', () => {
        const db = new OIMDB();
        const entityWriter = createOIMReplacingEntityWriter();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard, 'title' | 'rank'>(db, {
            entityWriter,
            columnNames: ['title', 'rank'],
        });
        const ace = cards.writeSlotContentByKey('c1', { id: 'c1', title: 'Ace', rank: 1 });
        const before = ace.entity;

        ace.updateEntity({ rank: 14 });

        expect(ace.entity).not.toBe(before);
        expect(cards.slotService.columnSlotService.holdColumnSlot(ace, 'rank')).toBe(ace.getColumnSlot('rank'));
    });

    it('refuses a column name the entity does not have', () => {
        const build = () => createOIMEntitySlotCollectionStoreAggregate<TCard>(new OIMDB(), {
            // @ts-expect-error 'titel' is not a column of TCard
            columnNames: ['titel'],
        });
        expect(build).not.toThrow();
    });
});
