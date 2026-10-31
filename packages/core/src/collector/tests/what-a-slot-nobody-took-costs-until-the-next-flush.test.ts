import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../OIMUnusedSlotCollectorService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const createFixture =() => {
    const db = new OIMDB();
    const unusedSlotCollectorSlot = db.collectorSlot.unusedSlotCollectorSlot;
    const unusedSlotCollector = {
        flush: (): void => { OIMUnusedSlotCollectorService.INSTANCE.flush(unusedSlotCollectorSlot); },
        open: (): void => { OIMUnusedSlotCollectorService.INSTANCE.open(unusedSlotCollectorSlot); },
        close: (): void => { OIMUnusedSlotCollectorService.INSTANCE.close(unusedSlotCollectorSlot); },
        run: <TAnswer>(body: () => TAnswer): TAnswer => OIMUnusedSlotCollectorService.INSTANCE.run(unusedSlotCollectorSlot, body),
    };
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const decksService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });
    const decks = decksService.createStoreSlot(db);
    return { db, unusedSlotCollector, cardsService, cards, decksService, decks };
};


describe('a slot nobody took', () => {
    it('answers a bare read, with nothing opened around it', () => {
        const { cardsService, cards, decksService, decks } = createFixture();

        const card = cardsService.getSlotByKey(cards, 'c1');
        const deck = decksService.getSlotByKey(decks, 'spades');

        expect(card.holdCount).toBe(1);
        expect(deck.holdCount).toBe(1);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        expect(decksService.getSlotByKey(decks, 'spades')).toBe(deck);
    });

    it('is swept by the unusedSlotCollector, across every collection at once', () => {
        const { unusedSlotCollector, cardsService, cards, decksService, decks } = createFixture();
        const card = cardsService.getSlotByKey(cards, 'c1');
        const deck = decksService.getSlotByKey(decks, 'spades');

        unusedSlotCollector.flush();

        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(decksService.getSlotCount(decks)).toBe(0);
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(oimIsSlotReleased(deck)).toBe(true);
    });

    it('is left alone once an effect names it, and goes when that effect does', () => {
        const { db, cardsService, cards } = createFixture();
        const card = cardsService.getSlotByKey(cards, 'c1');
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { /* the reference that keeps it */ }, [card]);

        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);

        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('is entered once however many times the key is read', () => {
        const { unusedSlotCollector, cardsService, cards } = createFixture();
        const first = cardsService.getSlotByKey(cards, 'c1');
        const again = cardsService.getSlotByKey(cards, 'c1');

        expect(again).toBe(first);
        expect(first.holdCount).toBe(1);

        unusedSlotCollector.flush();

        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('is not entered at all by a read of a key that already carries a value', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();

        const card = cardsService.getSlotByKey(cards, 'c1');

        expect(card.holdCount).toBe(0);

        db.flush();

        expect(cardsService.findSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });

    it('is not entered twice when a value lands on it after the read that minted it', () => {
        const { db, cardsService, cards } = createFixture();
        const card = cardsService.getSlotByKey(cards, 'c1');
        cardsService.slotContentService.writeSlotContent(card, { id: 'c1', title: 'one' });
        const again = cardsService.getSlotByKey(cards, 'c1');

        expect(again).toBe(card);
        expect(card.holdCount).toBe(1);

        db.flush();

        expect(card.holdCount).toBe(0);
        expect(cardsService.findSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });

    it('survives a frame that runs inside an open scope, and goes at its close', () => {
        const { db, unusedSlotCollector, cardsService, cards } = createFixture();

        unusedSlotCollector.open();
        const card = cardsService.getSlotByKey(cards, 'c1');
        db.flush();
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        unusedSlotCollector.close();

        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('is given back by the outermost scope and by no inner one', () => {
        const { unusedSlotCollector, cardsService, cards } = createFixture();
        let card!: TOIMEntitySlot<TCard, TOIMStoreKey>;

        unusedSlotCollector.run(() => {
            unusedSlotCollector.run(() => { card = cardsService.getSlotByKey(cards, 'c1'); });
            expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
        });

        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('is given back when the body of a scope throws', () => {
        const { unusedSlotCollector, cardsService, cards } = createFixture();

        expect(() => unusedSlotCollector.run(() => {
            cardsService.getSlotByKey(cards, 'c1');
            throw new Error('the body of a scope threw');
        })).toThrow('the body of a scope threw');

        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(() => unusedSlotCollector.close()).toThrow(/no scope is open/);
    });

    it('refuses a close that answers no open', () => {
        const { unusedSlotCollector } = createFixture();
        expect(() => unusedSlotCollector.close()).toThrow(/no scope is open/);
    });
});
