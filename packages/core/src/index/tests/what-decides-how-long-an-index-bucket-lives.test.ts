import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMSlotAfterIdleReleasePolicy } from '../../collector/OIMSlotAfterIdleReleasePolicy';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMDBOptions } from '../../db/types/TOIMDBOptions';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsSetStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;

const createFixture = (
    lifetime?: { slotReleasePolicy?: IOIMSlotReleasePolicy | undefined },
    dbOptions?: TOIMDBOptions,
) => {
    const db = new OIMDB(dbOptions);
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    let keysRead = 0;
    const byDeckService = createOIMSlotCollectionIndexService({
        entityService: cardsService,
        keyOf: (card: TCard) => { keysRead++; return card.deck; },
        slotContentService: new OIMSetBucketContentService<TCardSlot>(),
        ...lifetime,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const idsIn = (bucket: TBucket): string[] =>
        Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucket))
            .map(slot => slot.entity?.id ?? '')
            .sort();
    return { db, cards, cardsService, byDeck, byDeckService, idsIn, keysRead: () => keysRead };
};

const idleWindow = (keepAfterIdleMs: number): OIMSlotAfterIdleReleasePolicy => new OIMSlotAfterIdleReleasePolicy({
    keepAfterIdleMs,
});

const idleDbOptions: TOIMDBOptions = { getNowMs: () => 0, releaseTimer: () => () => undefined };

describe('what decides how long an index bucket lives', () => {
    it('mints no bucket for a key nobody holds', () => {
        const fixture = createFixture();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', deck: 'clubs', title: 'king' });
        fixture.db.flush();

        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(0);
    });

    it('keeps the bucket after the last hold is given back when the options named no release', () => {
        const fixture = createFixture();
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();

        spades.owner.unholdSlot(spades);

        expect(oimIsSlotReleased(spades)).toBe(false);
        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(1);
        expect(fixture.idsIn(spades)).toEqual(['c1']);
    });

    it('goes on filing into a bucket nobody holds while it still stands', () => {
        const fixture = createFixture();
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();
        spades.owner.unholdSlot(spades);

        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', deck: 'spades', title: 'two' });
        fixture.db.flush();

        expect(fixture.idsIn(spades)).toEqual(['c1', 'c2']);
    });

    it('hands back the standing bucket on a later hold without reading one key again', () => {
        const fixture = createFixture();
        const first = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();
        const readAfterTheWrite = fixture.keysRead();

        first.owner.unholdSlot(first);
        const again = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');

        expect(again).toBe(first);
        expect(fixture.keysRead()).toBe(readAfterTheWrite);
    });

    it('lets the bucket go at the last give-back when the options asked for that', () => {
        const fixture = createFixture({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();
        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(1);

        spades.owner.unholdSlot(spades);

        expect(oimIsSlotReleased(spades)).toBe(true);
        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(0);
    });

    it('lets a bucket read through getByKey go once its last effect leaves, when the options asked for that', () => {
        const fixture = createFixture({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        const spades = fixture.byDeckService.getSlotByKey(fixture.byDeck, 'spades');
        const effect = OIMEffectService.INSTANCE.createEffect(fixture.db, () => undefined, [spades]);
        fixture.db.flush();
        expect(oimIsSlotReleased(spades)).toBe(false);
        expect(fixture.idsIn(spades)).toEqual(['c1']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        fixture.db.flush();

        expect(oimIsSlotReleased(spades)).toBe(true);
        expect(fixture.idsIn(fixture.byDeckService.getSlotByKey(fixture.byDeck, 'spades'))).toEqual(['c1']);
    });

    it('fills a fresh bucket from the source when a released key is held again', () => {
        const fixture = createFixture({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
        const first = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', deck: 'spades', title: 'two' });
        fixture.db.flush();
        first.owner.unholdSlot(first);

        const again = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');

        expect(again).not.toBe(first);
        expect(fixture.idsIn(again)).toEqual(['c1', 'c2']);
    });

    it('leaves the bucket standing after the give-back when the options asked for an idle window', () => {
        const fixture = createFixture({ slotReleasePolicy: idleWindow(5_000) }, idleDbOptions);
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();

        spades.owner.unholdSlot(spades);

        expect(oimIsSlotReleased(spades)).toBe(false);
        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(1);
    });
});

describe('what an index bucket holds while it stands', () => {
    it('fills the bucket from the source the first time the key is held', () => {
        const fixture = createFixture();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', deck: 'clubs', title: 'king' });
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c3', { id: 'c3', deck: 'spades', title: 'two' });
        fixture.db.flush();

        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');

        expect(fixture.idsIn(spades)).toEqual(['c1', 'c3']);
        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(1);
    });

    it('files a later write into the bucket that is held', () => {
        const fixture = createFixture();
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();

        expect(fixture.idsIn(spades)).toEqual(['c1']);
    });

    it('mints nothing for a key that is written to and never held', () => {
        const fixture = createFixture();
        fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c9', { id: 'c9', deck: 'hearts', title: 'nine' });
        fixture.db.flush();

        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(1);
    });

    it('moves a row whose key changed out of the bucket it sat in', () => {
        const fixture = createFixture();
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        const clubs = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'clubs');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.db.flush();
        expect(fixture.idsIn(spades)).toEqual(['c1']);

        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'clubs', title: 'ace' });
        fixture.db.flush();

        expect(fixture.idsIn(spades)).toEqual([]);
        expect(fixture.idsIn(clubs)).toEqual(['c1']);
    });

    it('takes a row removed from the source out of every bucket holding it', () => {
        const fixture = createFixture();
        const spades = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades', title: 'ace' });
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', deck: 'spades', title: 'two' });
        fixture.db.flush();
        expect(fixture.idsIn(spades)).toEqual(['c1', 'c2']);

        const c2 = fixture.cardsService.findSlotByKey(fixture.cards, 'c2');
        if (c2 !== undefined) fixture.cardsService.slotContentService.clearSlotContent(c2);
        fixture.db.flush();

        expect(fixture.idsIn(spades)).toEqual(['c1']);
    });
});
