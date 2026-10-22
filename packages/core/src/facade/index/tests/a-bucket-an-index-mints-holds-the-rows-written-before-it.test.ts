import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsSetStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', deck: 'spades' },
        { id: 'c2', deck: 'spades' },
        { id: 'c3', deck: 'clubs' },
    ]);
    db.flush();
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const idsIn = (bucketSlot: TBucket): string[] =>
        Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucketSlot)).map(slot => slot.entity?.id ?? '').sort();
    return { db, cardsService, cards, byDeckService, byDeck, idsIn };
};

describe('a bucket an index mints holds the rows written before it', () => {
    it('through getByKey', () => {
        const { byDeckService, byDeck, idsIn } = createFixture();
        expect(idsIn(byDeckService.getSlotByKey(byDeck, 'spades'))).toEqual(['c1', 'c2']);
    });

    it('through holdByKey, and unhold gives it back through the same index', () => {
        const { byDeckService, byDeck, idsIn } = createFixture();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        expect(idsIn(spades)).toEqual(['c1', 'c2']);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(spades)).toBe(2);
        spades.owner.unholdSlot(spades);
    });

    it('through getByKeys, for every key at once', () => {
        const { byDeckService, byDeck, idsIn } = createFixture();
        const [spades, clubs, hearts] = byDeckService.getSlotsByKeys(byDeck, ['spades', 'clubs', 'hearts']);
        expect([idsIn(spades), idsIn(clubs), idsIn(hearts)]).toEqual([['c1', 'c2'], ['c3'], []]);
    });

    it('a row that moves leaves the old bucket and an effect on it hears the move', () => {
        const { db, cardsService, cards, byDeckService, byDeck, idsIn } = createFixture();
        const spades = byDeckService.getSlotByKey(byDeck, 'spades');
        const clubs = byDeckService.getSlotByKey(byDeck, 'clubs');
        let runCount = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [spades], [], () => { runCount++; });
        const c2 = cardsService.findSlotByKey(cards, 'c2');
        if (c2 !== undefined) cardsService.slotContentService.updateEntity(c2, { deck: 'clubs' });
        db.flush();
        expect(idsIn(spades)).toEqual(['c1']);
        expect(idsIn(clubs)).toEqual(['c2', 'c3']);
        expect(runCount).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
    });

    it('a removed row leaves its bucket', () => {
        const { cardsService, cards, byDeckService, byDeck, idsIn } = createFixture();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const c1 = cardsService.findSlotByKey(cards, 'c1');
        if (c1 !== undefined) cardsService.slotContentService.deleteEntity(c1);
        expect(idsIn(spades)).toEqual(['c2']);
        spades.owner.unholdSlot(spades);
    });

    it('a batch that moves many rows lands every row once', () => {
        const { db, cardsService, cards, byDeckService, byDeck, idsIn } = createFixture();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const clubs = byDeckService.holdSlotByKey(byDeck, 'clubs');
        let runCount = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [spades, clubs], [], () => { runCount++; });
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'clubs' },
            { id: 'c3', deck: 'spades' },
            { id: 'c4', deck: 'clubs' },
        ]);
        db.flush();
        expect(idsIn(spades)).toEqual(['c2', 'c3']);
        expect(idsIn(clubs)).toEqual(['c1', 'c4']);
        expect(runCount).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        spades.owner.unholdSlot(spades);
        clubs.owner.unholdSlot(clubs);
    });

    it('minting a bucket inside a frame does not throw', () => {
        const { db, cardsService, cards, byDeckService, byDeck, idsIn } = createFixture();
        const clubs = byDeckService.holdSlotByKey(byDeck, 'clubs');
        const seen: string[][] = [];
        const effect = OIMEffectService.INSTANCE.createEffect(db, [clubs], [], () => {
            seen.push(idsIn(byDeckService.getSlotByKey(byDeck, 'spades')));
        });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c4', deck: 'clubs' });
        db.flush();
        expect(seen).toEqual([['c1', 'c2']]);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        clubs.owner.unholdSlot(clubs);
    });

    it('dispose stops filing and gives back every row it held', () => {
        const { cardsService, cards, byDeckService, byDeck } = createFixture();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const c1 = cardsService.getSlotByKey(cards, 'c1');
        const heldBefore = c1.holdCount;
        byDeckService.disposeIndexStoreSlot(byDeck);
        expect(c1.holdCount).toBe(heldBefore - 1);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c5', deck: 'spades' });
        expect(oimIsSlotEmpty(spades)).toBe(true);
        expect(() => byDeckService.getSlotByKey(byDeck, 'spades')).toThrow();
    });
});
