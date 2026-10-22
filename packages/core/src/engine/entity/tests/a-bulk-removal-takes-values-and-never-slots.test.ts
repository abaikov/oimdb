/** Reading many keys, removing many slots, emptying a collection. */
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../../computed/types/TOIMComputedSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string };

type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

type TDeck = TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TOIMStoreKey>;

function createFixture() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    // A bucket collection is a store of buckets plus a bucket service, built by
    // the caller. Those two ARE the collection; the channel is what it tells.
    const byDeckService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
    const byDeck = byDeckService.createStoreSlot(db);
    const deck = (key: TOIMStoreKey): TDeck => byDeckService.getSlotByKey(byDeck, key) as TDeck;
    // The hold spans the write: once the bucket holds slots the emptiness
    // `OIMSlotContentBucketService.isSlotEmpty` answers reads false, so `unhold` leaves it filed.
    const file = (key: TOIMStoreKey, cardIds: readonly string[]): void => {
        const heldSlot = byDeckService.holdSlotByKey(byDeck, key);
        byDeckService.slotContentService.writeBucketMemberSlots(heldSlot, cardIds.map(id => cardsService.getSlotByKey(cards,id) as TOIMEntitySlot<TCard, TOIMStoreKey>));
        heldSlot.owner.unholdSlot(heldSlot);
    };
    const deleteEntities = (slots: readonly TCardSlot[]): void => {
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        try {
            for (const slot of slots) cardsService.slotContentService.deleteEntity(slot);
        } finally {
            OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        }
    };
    const deleteEntitiesByKeys = (keys: readonly string[]): void => {
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        try {
            for (const key of keys) {
                const slot = cardsService.findSlotByKey(cards, key);
                if (slot !== undefined) cardsService.slotContentService.deleteEntity(slot);
            }
        } finally {
            OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        }
    };
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', deckId: 'd1' }, { id: 'c2', deckId: 'd1' },
        { id: 'c3', deckId: 'd2' }, { id: 'c4', deckId: 'd3' },
    ]);
    // A bucket's slots are the caller's, so the deck of each card is written here
    // rather than derived from the column that names it.
    file('d1', ['c1', 'c2']);
    file('d2', ['c3']);
    file('d3', ['c4']);
    db.flush();
    return { db, cardsService, cards, byDeckService, byDeck, deck, deleteEntities, deleteEntitiesByKeys };
}

describe('a bulk removal takes the values it names', () => {
    /**
     * A REMOVAL TAKES THE VALUE AND NEVER TAKES THE SLOT OUT OF ITS BUCKET, and
     * that is the contract of a manual bucket collection rather than an
     * oversight: the caller put the slot in the bucket, so the caller takes it
     * out. The slot keeps its place with `entity === undefined` — which is
     * exactly what a reserved key looks like, an id from a server's page whose
     * value has not arrived — until the caller says otherwise.
     */
    it('removes the values through identities and leaves the slots standing', () => {
        const { db, cardsService, cards, byDeckService, byDeck, deck, deleteEntities } = createFixture();
        const c1 = cardsService.getSlotByKey(cards,'c1')!;
        deleteEntities([c1, cardsService.getSlotByKey(cards,'c2')!]);
        db.flush();

        expect(oimIsSlotEmpty(c1)).toBe(true);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck('d1'))).toBe(2);
        expect(cardsService.getSlotByKey(cards,'c3')!.entity).toBeDefined();

        // And the eviction, written: with the value gone and the slot taken out
        // of the bucket, nothing points at the identity and the bucket is empty.
        const d1 = deck('d1');
        byDeckService.slotContentService.clearBucketMemberSlots(d1);
        expect(oimIsSlotReleased(d1)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(2);
        expect(oimIsSlotReleased(c1)).toBe(true);
    });

    it('removes by key, and a key that is not there is not an error', () => {
        const { db, cardsService, cards, deleteEntitiesByKeys } = createFixture();
        expect(() => deleteEntitiesByKeys(['c1', 'nope'])).not.toThrow();
        db.flush();
        // Still filed, because its deck still names it — the value is what went.
        expect(oimIsSlotEmpty(cardsService.getSlotByKey(cards,'c1')!)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(4);
    });
});

describe('clearing takes every value and leaves every slot', () => {
    /**
     * `clear` is `remove` for every slot and nothing more, so it takes every
     * value and takes no slot out of a bucket. The collection still holds all
     * four identities afterwards — each of them held by the bucket the caller
     * put it in — and emptying those buckets is the second half of the act,
     * written by whoever put the slots in.
     */
    it('empties every slot and leaves it where the caller put it', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = createFixture();
        cardsService.slotContentService.clearAllEntities(cards);
        db.flush();

        expect(oimIsSlotEmpty(cardsService.getSlotByKey(cards,'c1')!)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(4);
        expect(byDeckService.getSlotCount(byDeck)).toBe(3);

        for (const bucket of Array.from(byDeckService.getSlots(byDeck))) byDeckService.slotContentService.clearBucketMemberSlots(bucket);
        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });

    it('an identity something depends on survives its value and its bucket alike', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = createFixture();
        const kept = cardsService.getSlotByKey(cards,'c1')!;
        // An effect is a reference to the identity; the body is not the point.
        OIMEffectService.INSTANCE.createEffect(db, [kept], [], () => { /* nothing */ });
        cardsService.slotContentService.clearAllEntities(cards);
        db.flush();
        for (const bucket of Array.from(byDeckService.getSlots(byDeck))) byDeckService.slotContentService.clearBucketMemberSlots(bucket);

        expect(oimIsSlotEmpty(kept)).toBe(true);
        expect(cardsService.getSlotByKey(cards,'c1')).toBe(kept);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('wakes every row whose value it took, once', () => {
        const { db, cardsService, cards } = createFixture();
        let woken = 0;
        OIMEffectService.INSTANCE.createEffect(db, [cardsService.getSlotByKey(cards,'c1')], [], () => { woken++; });
        OIMEffectService.INSTANCE.createEffect(db, [cardsService.getSlotByKey(cards,'c4')], [], () => { woken++; });
        cardsService.slotContentService.clearAllEntities(cards);
        db.flush();
        expect(woken).toBe(2);
    });
});

describe('what a bulk removal leaves for the watchers to count', () => {
    // A derivation contributes its READER and not itself: an {@link TOIMEffect}
    // collects the roots of its computeds transitively and files ITSELF in each.
    it('counts every dependent, and an effect over a derivation is one of them', () => {
        const { db, cardsService, cards } = createFixture();
        const slot = cardsService.getSlotByKey(cards,'c1')!;
        expect(slot.effects?.length ?? 0).toBe(0);

        const direct = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* nothing */ });
        expect(slot.effects?.length).toBe(1);

        // A derivation over the same slot, read by nobody: it is asked, never
        // woken, so it is in no root's list.
        const computedService = createOIMComputedService<void, number>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
            columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>(),
            sameValueGuard: oimSameValueZeroGuard,
        });
        const computed = computedService.createComputedStoreSlot(db, () => 1, () => ({ sourceSlots: [slot] }));
        const computedSlot = computedService.computedCollectionService.holdSlotByKey(computed, undefined);
        expect(slot.effects?.length).toBe(1);

        // And its reader IS, because the walk that collects an effect's roots
        // goes through the derivations it reads.
        const throughComputed = OIMEffectService.INSTANCE.createEffect(db, [], [computedSlot], () => { /* nothing */ });
        expect(slot.effects?.length).toBe(2);

        // A SECOND SUBSCRIBER IS A SECOND DEPENDENT.
        const second = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* nothing */ });
        expect(slot.effects?.length).toBe(3);
        OIMEffectService.INSTANCE.disposeEffect(second);
        expect(slot.effects?.length).toBe(2);

        OIMEffectService.INSTANCE.disposeEffect(direct);
        expect(slot.effects?.length).toBe(1);
        OIMEffectService.INSTANCE.disposeEffect(throughComputed);
        expect(slot.effects?.length).toBe(0);
    });

    it('counts buckets and slots', () => {
        const { db, cardsService, cards, byDeckService, byDeck, deck, deleteEntitiesByKeys } = createFixture();
        expect(byDeckService.getSlotCount(byDeck)).toBe(3);
        expect(cardsService.getSlotCount(cards)).toBe(4);

        // The slot's value AND its place in the bucket, because those are two facts and
        // only the second one is what a bucket is counting.
        deleteEntitiesByKeys(['c4']);
        byDeckService.slotContentService.clearBucketMemberSlots(deck('d3'));
        db.flush();

        expect(byDeckService.getSlotCount(byDeck)).toBe(2);
        expect(cardsService.getSlotCount(cards)).toBe(3);
    });
});
