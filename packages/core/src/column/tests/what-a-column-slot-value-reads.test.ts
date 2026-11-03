import { OIMDB } from '../../db/OIMDB';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../../slot/createOIMSlotCollectionStoreAggregate';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { createOIMColumnGroup } from '../utils/createOIMColumnGroup';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import { createOIMSingleSourceTrackingComputedService } from '../../computed/createOIMSingleSourceTrackingComputedService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string; rank: number };

const titleAndRank = createOIMColumnGroup<keyof TCard>(['title', 'rank']);

const createFixture = () => {
    const db = new OIMDB();
    const cards = createOIMSlotCollectionStoreAggregate(db, {
        slotContentService: createOIMEntityContentService<TCard>(), columnGroups: [titleAndRank],
    });
    cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
    cards.writeSlotContentByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 2 });
    db.flush();
    return { db, cards };
};

describe('what a column slot value reads', () => {
    it('reads one field, the whole entity, and a group of fields of an entity in the group\'s sorted name order', () => {
        const { cards } = createFixture();
        const ace = cards.getSlotByKey('c1');

        expect(ace.holdColumnSlot('title').value).toBe('Ace');
        expect(ace.holdAnyColumnSlot().value).toBe(ace.entity);
        expect(ace.holdColumnGroupSlot(titleAndRank).value).toEqual([1, 'Ace']);
    });

    it('keeps the identity of a group value while its fields stay the same, and changes it when one moves', () => {
        const { db, cards } = createFixture();
        const ace = cards.getSlotByKey('c1');
        const titleAndRankSlot = ace.holdColumnGroupSlot(titleAndRank);
        const first = titleAndRankSlot.value;

        cards.slotContentService.updateEntity(ace, { deck: 'clubs' });
        db.flush();
        expect(titleAndRankSlot.value).toBe(first);

        cards.slotContentService.updateEntity(ace, { rank: 5 });
        db.flush();
        expect(titleAndRankSlot.value).toEqual([5, 'Ace']);
        expect(titleAndRankSlot.value).not.toBe(first);
    });

    it('wakes a tracked effect that read the column when that field is written, and not for another field', () => {
        const { db, cards } = createFixture();
        const ace = cards.getSlotByKey('c1');
        const titleColumn = ace.holdColumnSlot('title');
        const seen: unknown[] = [];
        const dispose = db.createEffect(() => { seen.push(titleColumn.value); });

        cards.slotContentService.updateEntity(ace, { rank: 9 });
        db.flush();
        cards.slotContentService.updateEntity(ace, { title: 'Ace of spades' });
        db.flush();
        dispose();

        expect(seen).toEqual(['Ace', 'Ace of spades']);
    });

    it('wakes an effect over a source-tracking computed that read an entity column', () => {
        const { db, cards } = createFixture();
        const ace = cards.getSlotByKey('c1');
        const titleColumn = ace.holdColumnSlot('title');
        const shoutService = createOIMSingleSourceTrackingComputedService<string>({
            derive: () => String(titleColumn.value).toUpperCase(),
        });
        const shout = shoutService.createStoreSlot(db);
        db.flush();
        const shoutSlot = shoutService.holdSingleSlot(shout);
        const seen: unknown[] = [];
        OIMEffectService.INSTANCE.createAndRunEffect(db, () => { seen.push(shoutSlot.value); }, [], [], [shoutSlot]);

        cards.slotContentService.updateEntity(ace, { title: 'One' });
        db.flush();

        expect(seen).toEqual(['ACE', 'ONE']);
    });

    it('reads the values of that field across the members of a bucket, in bucket order, and the members themselves', () => {
        const { cards } = createFixture();
        const byDeckService = createOIMSlotCollectionIndexService({ entityService: cards.slotService, columns: ['deck'] });
        const byDeck = byDeckService.createIndexStoreSlot(cards.storeSlot);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        const titles = byDeckService.holdBucketColumnSlotByKey(byDeck, 'spades', 'title');
        const members = byDeckService.holdAnyBucketColumnSlotByKey(byDeck, 'spades');

        expect(titles.value).toEqual([...spades.getBucketMemberSlots()].map(member => member.entity?.title));
        expect(members.value).toEqual([...spades.getBucketMemberSlots()].map(member => member.entity));
        expect(titles.value).toBe(titles.value);
    });

    it('wakes a tracked read of a bucket column when a member joins or leaves, since its value lists the members', () => {
        const { db, cards } = createFixture();
        const byDeckService = createOIMSlotCollectionIndexService({ entityService: cards.slotService, columns: ['deck'] });
        const byDeck = byDeckService.createIndexStoreSlot(cards.storeSlot);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const titles = byDeckService.holdBucketColumnSlotByKey(byDeck, 'spades', 'title');
        const seen: unknown[] = [];
        const dispose = db.createEffect(() => { seen.push([...(titles.value as string[])].sort()); });

        cards.writeSlotContentByKey('c3', { id: 'c3', deck: 'spades', title: 'Three', rank: 3 });
        db.flush();
        cards.slotContentService.updateEntity(cards.getSlotByKey('c1'), { deck: 'hearts' });
        db.flush();
        dispose();

        expect(seen).toEqual([['Ace', 'Two'], ['Ace', 'Three', 'Two'], ['Three', 'Two']]);
    });

    it('reads a column of a computed through the same doors an entity has', () => {
        const db = new OIMDB();
        const summaryService = createOIMSingleComputedService<{ total: number; label: string }>({});
        const summary = summaryService.createStoreSlot(db, () => ({ total: 3, label: 'three' }), () => ({}));
        db.flush();
        const summarySlot = summaryService.holdSingleSlot(summary);

        expect(summarySlot.holdColumnSlot('total').value).toBe(3);
        expect(summarySlot.holdAnyColumnSlot().value).toEqual({ total: 3, label: 'three' });
    });

    it('refuses to read a column slot that was released', () => {
        const { db, cards } = createFixture();
        const service = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const store = service.createStoreSlot(db);
        service.writeSlotContentByKey(store, 'c9', { id: 'c9', deck: 'hearts', title: 'Nine', rank: 9 });
        db.flush();
        const titleColumn = service.getSlotByKey(store, 'c9').getColumnSlot('title');
        db.flush();

        expect(() => titleColumn.value).toThrow();
        expect(cards.getSlotByKey('c1').entity?.title).toBe('Ace');
    });
});
