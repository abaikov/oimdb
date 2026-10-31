import { OIMDB, OIMEffectService, OIMSetBucketContentService, OIMSlotAfterIdleReleasePolicy, oimMintAfterIdleSlotReleaseWheel, oimIsSlotReleased } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

/**
 * An index the consumer built by hand over a collection, both on one clock, with
 * time and the timer under the test's control.
 */
const createFixture =(after: number) => {
    let ms = 1_000_000;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const slotReleasePolicy = new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: after });
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), slotReleasePolicy });
    const byDeckService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TCardSlot>(), slotReleasePolicy });
    const cards = cardsService.createStoreSlot(db);
    const byDeck = byDeckService.createStoreSlot(db);
    return {
        db, cardsService, cards, byDeckService, byDeck,
        flushAfterIdle: (): void => {
            oimMintAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
        },
        at: (v: number): void => { ms = v; },
    };
};

/** The rows, and the bucket naming them, filed by hand as a consumer does. */
const load = (fixture: ReturnType<typeof createFixture>) => {
    const rows = [
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', deck: 'spades' }),
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', deck: 'spades' }),
    ];
    fixture.db.flush();
    const heldSlot = fixture.byDeckService.holdSlotByKey(fixture.byDeck, 'spades');
    fixture.byDeckService.slotContentService.writeSlotContent(heldSlot, rows);
    fixture.db.flush();
    return { rows, heldSlot };
};

describe('an index nothing subscribes to, once its window has run out', () => {
    it('goes, and takes the rows it was the last thing naming', () => {
        const fixture = createFixture(30_000);
        const { rows, heldSlot } = load(fixture);
        // THE ROWS ARE PINNED WHILE THE INDEX NAMES THEM: `writeBucketMemberSlots` holds
        // each arrival, and `releaseSlotIfUnheld` returns on `holdCount > 0`.
        expect(rows[0].holdCount).toBeGreaterThan(0);

        // THE CONSUMER LETS THE INDEX GO, and the release is declined: the bucket
        // still holds its rows, so `isEmpty` reads false. The sweep takes it later.
        heldSlot.owner.unholdSlot(heldSlot);
        expect(fixture.byDeckService.getSlotByKey(fixture.byDeck, 'spades')).toBe(heldSlot);

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterIdle();

        // ONE SWEEP, BOTH LEVELS. Letting the bucket go gives back one reference
        // per row it named, and each row — whose own window ran out while a stale
        // index held it, because that is not somebody using the row — is taken by
        // the ordinary door the instant that reference departs.
        expect(oimIsSlotReleased(heldSlot)).toBe(true);
        expect(fixture.byDeckService.getSlotCount(fixture.byDeck)).toBe(0);
        expect(oimIsSlotReleased(rows[0])).toBe(true);
        expect(oimIsSlotReleased(rows[1])).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});

describe('a row a LIVE index still names', () => {
    it('keeps its value, and is not emptied under the index', () => {
        const fixture = createFixture(30_000);
        const { heldSlot } = load(fixture);
        const bucket = fixture.byDeckService.getSlotByKey(fixture.byDeck, 'spades')!;
        // The consumer keeps the bucket: `hold` is what a live index is.
        const watched = OIMEffectService.INSTANCE.createEffect(fixture.db, () => undefined, [bucket]);

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterIdle();

        // THE ROWS ARE CONDEMNED AND STILL WHOLE. This is the case the mark
        // exists for: a design that cleared the value on the sweep would leave
        // the index naming rows with nothing in them, and nothing would throw.
        expect(fixture.byDeckService.getSlotByKey(fixture.byDeck, 'spades')).toBe(bucket);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', deck: 'spades' });
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c2')?.entity).toEqual({ id: 'c2', deck: 'spades' });
        expect([...fixture.byDeckService.slotContentService.getBucketMemberSlots(bucket)].length).toBe(2);

        OIMEffectService.INSTANCE.disposeEffect(watched);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
