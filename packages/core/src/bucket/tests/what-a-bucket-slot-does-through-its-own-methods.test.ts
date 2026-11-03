import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSetBucketContentService } from '../OIMSetBucketContentService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../computed/createOIMSingleComputedService';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const ace = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'Ace' });
    const two = cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', title: 'Two' });
    const three = cardsService.writeSlotContentByKey(cards, 'c', { id: 'c', title: 'Three' });
    const decksService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>() });
    const decks = decksService.createStoreSlot(db);
    const deck = decksService.holdSlotByKey(decks, 'd1');
    db.flush();
    return { db, cardsService, cards, ace, two, three, decksService, decks, deck };
};

describe('what a bucket slot does through its own methods', () => {
    it('writes, adds, removes and reads its own members', () => {
        const { db, ace, two, three, deck } = createFixture();
        expect(deck.writeSlotContent([ace, two])).toBe(true);
        expect(deck.getBucketMemberSlotCount()).toBe(2);
        expect(deck.hasBucketMemberSlot(ace)).toBe(true);
        deck.addBucketMemberSlot(three);
        deck.removeBucketMemberSlot(ace);
        expect([...deck.getBucketMemberSlots()]).toEqual([two, three]);
        deck.addBucketMemberSlots([ace]);
        deck.removeBucketMemberSlots([two, three]);
        expect([...deck.getBucketMemberSlots()]).toEqual([ace]);
        deck.clearSlotContent();
        db.flush();
        expect(deck.getBucketMemberSlotCount()).toBe(0);
    });

    it('wakes a subscriber when told by hand that its membership changed', () => {
        const { db, deck } = createFixture();
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [deck]);
        deck.markContentChanged();
        db.flush();
        expect(runs).toBe(1);
    });

    it('becomes a source of a tracked body when its membership is read', () => {
        const { db, ace, two, deck } = createFixture();
        deck.writeSlotContent([ace]);
        db.flush();
        const seen: number[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            seen.push(deck.getBucketMemberSlotCount());
        });
        deck.addBucketMemberSlot(two);
        db.flush();
        expect(seen).toEqual([1, 2]);
    });

    it('names the members a given list lacks, and becomes a source of a tracked body by it', () => {
        const { db, ace, two, three, deck } = createFixture();
        deck.writeSlotContent([ace, two, three]);
        db.flush();
        const seen: number[] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            seen.push(deck.getBucketMemberSlotsMissingFrom([two]).length);
        });
        expect(deck.getBucketMemberSlotsMissingFrom([two])).toEqual([ace, three]);
        deck.removeBucketMemberSlot(ace);
        db.flush();
        expect(seen).toEqual([2, 1]);
    });

    it('holds itself and gives the hold back, as column and computed slots do', () => {
        const { db, ace, decksService, decks } = createFixture();
        const empty = decksService.getSlotByKey(decks, 'd2');
        empty.holdSlot();
        db.flush();
        expect(isOIMSlotReleased(empty)).toBe(false);
        empty.unholdSlot();
        expect(isOIMSlotReleased(empty)).toBe(true);

        const title = ace.getColumnSlot('title');
        title.holdSlot();
        db.flush();
        expect(isOIMSlotReleased(title)).toBe(false);
        title.unholdSlot();
        db.flush();
        expect(isOIMSlotReleased(title)).toBe(true);

        const countService = createOIMSingleComputedService<number>({ createSources: () => ({}), derive: () => 1, initialValue: 0 });
        const count = countService.getSingleSlot(countService.createStoreSlot(db));
        count.holdSlot();
        db.flush();
        expect(isOIMSlotReleased(count)).toBe(false);
        count.unholdSlot();
        db.flush();
        expect(isOIMSlotReleased(count)).toBe(true);
    });
});
