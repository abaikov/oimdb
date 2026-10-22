/**
 * The linked-index updater against a real runtime, with no Redux anywhere.
 *
 * `what-a-linked-index-does-through-a-reducer.test.ts` drives the same code through `createCollectionReducer`
 * and asserts what the bucket ends up holding — so it pins the reducer's
 * plumbing, and every claim below about WHAT `write` does with the list it is
 * handed rides along invisibly inside it. These are that half, on its own: the
 * updater resolves pks through `linkedEntityService.holdSlotByKey` and hands the whole
 * list to `OIMBucketService.writeBucketMemberSlots`, and both of those are core's, both are
 * silent when they change, and neither has a test of this package's that would
 * notice.
 */
import { OIMDB, OIMEffectService } from '@oimdb/core';
import type { TOIMReduxLinkedIndex } from '../src';
import { OIMReduxLinkedIndexesUpdater } from '../src';
import type { TBucketService, TBucketStoreSlot } from './support/engine';
import { bucketServiceOf, entityServiceOf } from './support/engine';

type TDeck = { id: string; name: string; cardIds: string[] };
type TCard = { id: string; title: string };

function build() {
    const db = new OIMDB();
    const cardsService = entityServiceOf<TCard>(db, item => item.id);
    const cards = cardsService.createStoreSlot(db);
    // What the bucket holds here is the deck's field, written by the updater below on
    // every call — there is nothing else that could undo it.
    const cardsByDeckService = bucketServiceOf<TCard>(db);
    const cardsByDeck = cardsByDeckService.createStoreSlot(db);
    return {
        db,
        cardsService,
        cards,
        cardsByDeckService,
        cardsByDeck,
        linkedIndexes: [
            {
                bucketService: cardsByDeckService,
                bucketStoreSlot: cardsByDeck,
                linkedEntityService: cardsService,
                linkedEntityStoreSlot: cards,
                fieldName: 'cardIds',
            },
        ] as ReadonlyArray<TOIMReduxLinkedIndex<TDeck, TCard>>,
        updater: new OIMReduxLinkedIndexesUpdater<TDeck>(entity => entity.id),
    };
}

// The updater takes ENTITIES and reads each one's key off it, so this is a
// deck and no longer a record keyed by one.
const deck = (cardIds: string[]): TDeck => ({ id: 'd1', name: 'Starter', cardIds });

/** What the bucket for `key` holds, by slot key — `[]` for no bucket. */
function slotKeysOf(cardsByDeckService: TBucketService<TCard>, cardsByDeck: TBucketStoreSlot<TCard>, key: string): unknown[] {
    const bucket = cardsByDeckService.findSlotByKey(cardsByDeck, key);
    if (bucket === undefined) return [];
    return Array.from(cardsByDeckService.slotContentService.getBucketMemberSlots(bucket)).map(slot => slot.key);
}

describe('writing a linked index from an entity field', () => {
    it('makes the field the list, in its order, and reserves an id whose row has not arrived', () => {
        const { db, cardsService, cards, cardsByDeckService, cardsByDeck, linkedIndexes, updater } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'Ace' });
        db.flush();

        updater.updateLinkedIndexesForEntities(linkedIndexes, [deck(['c1', 'c2'])]);
        db.flush();

        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1')).toEqual(['c1', 'c2']);
        // 'c2' has no row — an ordered page of ids arriving before its rows is
        // the ordinary shape of this. A hold MINTS the identity rather than
        // dropping the id, so the list is complete and the row can land
        // into it later; the bucket's own hold is what keeps it after the
        // updater gives its transient one back.
        expect(cardsService.getSlotByKey(cards, 'c2')?.entity).toBeUndefined();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c2', title: 'King' });
        db.flush();
        const bucket = cardsByDeckService.getSlotByKey(cardsByDeck, 'd1');
        expect(Array.from(cardsByDeckService.slotContentService.getBucketMemberSlots(bucket)).map(slot => slot.entity))
            .toEqual([{ id: 'c1', title: 'Ace' }, { id: 'c2', title: 'King' }]);
    });

    it('re-sending the list it already holds wakes nobody, and re-ordering it wakes nobody either', () => {
        const { db, cardsService, cards, cardsByDeckService, cardsByDeck, linkedIndexes, updater } = build();
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', title: 'Ace' }, { id: 'c2', title: 'King' }]);
        updater.updateLinkedIndexesForEntities(linkedIndexes, [deck(['c1', 'c2'])]);
        db.flush();

        const bucket = cardsByDeckService.getSlotByKey(cardsByDeck, 'd1');
        expect(bucket).toBeDefined();
        let runCount = 0;
        const watcher = OIMEffectService.INSTANCE.createEffect(db, [bucket!], [], () => { runCount++; });

        // The reducer re-derives the slots for every entity it saw change, and
        // an entity changes for reasons that have nothing to do with its linked
        // field — a rename, a flag. Every one of those re-sends this same list.
        // The updater does no diffing of its own precisely because
        // `OIMBucketService.writeBucketMemberSlots` asks the service whether the bucket
        // already holds exactly these slots; without that question each of
        // them would evict and rejoin every row and wake every screen showing
        // the deck.
        updater.updateLinkedIndexesForEntities(linkedIndexes, [deck(['c1', 'c2'])]);
        db.flush();
        expect(runCount).toBe(0);

        // THE SAME SLOTS IN ANOTHER ORDER IS NOT A CHANGE HERE, and the reason
        // is the service this bucket collection was built with: `Unordered`
        // keeps its slots in a `Set`, which has no order to express.
        //
        // Which means the linked-index path never carried a server-decided order
        // at all; it carried the order of the last eviction. A bucket collection
        // that must keep one needs an ordered service, and that is a decision for
        // whoever wants it rather than something this test can assert into
        // existence.
        updater.updateLinkedIndexesForEntities(linkedIndexes, [deck(['c2', 'c1'])]);
        db.flush();
        expect(runCount).toBe(0);
        expect(slotKeysOf(cardsByDeckService, cardsByDeck, 'd1').slice().sort()).toEqual(['c1', 'c2']);

        OIMEffectService.INSTANCE.disposeEffect(watcher);
    });

    it('gives back the bucket and the reserved identities when the owning entity goes', () => {
        const { db, cardsService, cards, cardsByDeckService, cardsByDeck, linkedIndexes, updater } = build();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'Ace' });
        updater.updateLinkedIndexesForEntities(linkedIndexes, [deck(['c1', 'c2'])]);
        db.flush();

        updater.removeLinkedIndexesByKeys(linkedIndexes, ['d1']);
        db.flush();

        // The bucket held nothing and nobody held the bucket, so the collection
        // no longer has one under this key — one keyed by a deck id would
        // otherwise keep one per deck ever deleted.
        expect(cardsByDeckService.getSlotCount(cardsByDeck)).toBe(0);
        // 'c2' was never more than a slot in a bucket: that was the only thing
        // pointing at that identity, so the population has let it go. 'c1' holds
        // a value, and a value is not a reference — it stays.
        expect(Array.from(cardsService.getSlots(cards)).map(c => c.key)).toEqual(['c1']);
        expect(cardsService.getSlotByKey(cards, 'c1').entity?.title).toBe('Ace');
    });

    it('leaves no bucket behind for a linked field with nothing in it', () => {
        // A list with nothing in it resolves its bucket with `find`, which
        // does not mint — so writing an empty list, whether because the field is
        // empty or because the owning entity is gone, cannot leave a bucket
        // behind under a key the collection never had one for. A hold, which
        // mints, is used only when there are rows to put in it.
        //
        // Without that split the two reads disagree: `write` handed an empty
        // list over a freshly minted empty bucket sees the slots it already
        // has and returns before the line that asks whether the bucket may go. A
        // deck with no cards, and every deck deleted that never had any, would
        // leave a permanent empty bucket — one per key, for the life of the
        // process.
        const { db, cardsByDeckService, cardsByDeck, linkedIndexes, updater } = build();

        updater.updateLinkedIndexesForEntities(linkedIndexes, [deck([])]);
        updater.removeLinkedIndexesByKeys(linkedIndexes, ['d2']);
        db.flush();

        expect(cardsByDeckService.getSlotCount(cardsByDeck)).toBe(0);
    });
});
