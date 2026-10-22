import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string; title: string };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cards, cardsService };
};

/**
 * The two halves, as the caller composes them: READ NOW off the identity, HEAR
 * LATER through an effect over it. The identity is resolved ONCE, here, and the
 * closures hold it — which is the pattern this package keeps whatever builds
 * the pair: pay the lookup where the relationship is formed, never where it is
 * used.
 */
const bind = <TValue>(
    db: OIMDB, slot: TOIMSlot, getValue: () => TValue,
): { getValue: () => TValue; onChange: (handler: () => void) => TOIMDisposer } => ({
    getValue,
    onChange: (handler) => {
        const effect = OIMEffectService.INSTANCE.createEffect(db, [slot], [], handler);
        return () => { OIMEffectService.INSTANCE.disposeEffect(effect); };
    },
});

describe('handing a slot to a foreign binding', () => {
    it('gives out its two halves as plain functions that work detached', () => {
        const { db, cards, cardsService } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha' });
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1')!;
        const binding = bind(db, slot, () => slot.entity);

        // Pulled off the object entirely — no `this`, no bind, no wrapper.
        const { getValue, onChange } = binding;
        let runCount = 0;
        const off = onChange(() => { runCount++; });

        expect(getValue()?.title).toBe('alpha');
        cardsService.slotContentService.updateEntity(slot, { title: 'ALPHA' });
        db.flush();
        expect(runCount).toBe(1);
        expect(getValue()?.title).toBe('ALPHA');
        off();
    });

    it('adapts to another library\'s names as an object literal, built once', () => {
        const { db, cards, cardsService } = createFixture();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha' });
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1')!;
        const binding = bind(db, slot, () => slot.entity);

        // Whatever the library calls them, the properties ARE our closures:
        // a call goes straight to the value, not through a shim.
        const foreign = { subscribe: binding.onChange, getSnapshot: binding.getValue };
        expect(foreign.getSnapshot).toBe(binding.getValue);
        expect(foreign.subscribe).toBe(binding.onChange);

        let runCount = 0;
        const off = foreign.subscribe(() => { runCount++; });
        cardsService.slotContentService.updateEntity(slot, { title: 'ALPHA' });
        db.flush();
        expect(runCount).toBe(1);
        expect(foreign.getSnapshot()?.title).toBe('ALPHA');
        off();
    });

    it('warns by example why a value-comparing binding needs a counter', () => {
        // Naming adapts for free; semantics do not. Both reads here hand back a
        // reference that never changes, so a binding that decides "did it
        // change" by comparing snapshots would never fire.
        const { db, cards, cardsService } = createFixture();
        const byDeckService = createOIMBucketService<
            TOIMEntitySlot<TCard, TOIMStoreKey>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard, TOIMStoreKey>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard, TOIMStoreKey>>() });
        const byDeck = byDeckService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1', title: 'alpha' });
        db.flush();
        const deckSlot = byDeckService.holdSlotByKey(byDeck, 'd1');
        byDeckService.slotContentService.writeBucketMemberSlots(deckSlot, [cardsService.getSlotByKey(cards, 'c1')!]);

        const card = bind(db, cardsService.getSlotByKey(cards, 'c1')!, () => cardsService.getSlotByKey(cards, 'c1')?.entity);
        const entityBefore = card.getValue();
        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1')!, { title: 'ALPHA' });
        db.flush();
        // An in-place write: the value changed, the reference did not.
        expect(card.getValue()).toBe(entityBefore);

        const slots = bind(db, deckSlot, () => byDeckService.slotContentService.getBucketMemberSlots(deckSlot));
        const slotsBefore = slots.getValue();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deckId: 'd1', title: 'beta' });
        byDeckService.slotContentService.writeBucketMemberSlots(deckSlot, [cardsService.getSlotByKey(cards, 'c1')!, cardsService.getSlotByKey(cards, 'c2')!]);
        db.flush();
        // The bucket grew; what is handed back is the same live slots object.
        expect(slots.getValue()).toBe(slotsBefore);
        expect(Array.from(slots.getValue()).length).toBe(2);

        // So the counter belongs in the binding, driven by the notification.
        let version = 0;
        const off = slots.onChange(() => { version++; });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c3', deckId: 'd1', title: 'gamma' });
        byDeckService.slotContentService.writeBucketMemberSlots(deckSlot, [
            cardsService.getSlotByKey(cards, 'c1')!, cardsService.getSlotByKey(cards, 'c2')!, cardsService.getSlotByKey(cards, 'c3')!,
        ]);
        db.flush();
        expect(version).toBe(1);
        off();
        deckSlot.owner.unholdSlot(deckSlot);
    });
});
