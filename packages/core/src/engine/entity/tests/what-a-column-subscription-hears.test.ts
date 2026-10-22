import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';

import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type Card = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, {
        // The store is named by the SLOT it files, not by the entity inside it.
        // jest transpiles these files without type-checking them, so a wrong
        // generic here compiles and no case can catch it.
        entitySlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMEntitySlot<Card, TOIMStoreKey>>(),
        keyOf: (card) => card.id,
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a column subscription is woken by its own field and by no other', () => {
    it('runs when that field moves', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'rank')], [], () => { runs++; });
        db.flush();
        const born = runs;

        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 2 });
        db.flush();
        expect(runs).toBe(born + 1);
    });

    it('does not run when a different field moves', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'rank')], [], () => { runs++; });
        db.flush();
        const born = runs;

        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A2', rank: 1 });
        db.flush();
        expect(runs).toBe(born);
    });
});

describe('the column identity is minted by the subscription and goes with it', () => {
    it('files nothing on a slot nobody watches by column', () => {
        const { cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        expect(cardsService.getSlotByKey(cards,'a')!.columnSlotStore).toBeUndefined();
    });

    it('files one entry while watched and drops the map when the last leaves', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        const rank = OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'rank')], [], () => { /* nothing */ });
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(1);

        const title = OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(2);

        OIMEffectService.INSTANCE.disposeEffect(rank);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(1);

        OIMEffectService.INSTANCE.disposeEffect(title);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(slot.columnSlotStore).toBeUndefined();
    });

    it('hands the same column identity to two subscribers of one field', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'rank')], [], () => { /* nothing */ });
        OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'rank')], [], () => { /* nothing */ });
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(1);
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('rank')?.effects?.length).toBe(2);
    });
});

/**
 * WHO MAY UNFILE A COLUMN IDENTITY — and it is only the identity that is
 * actually filed, only once nothing refers to it.
 *
 * Both sequences below can delete a LIVE entry from `slot.columnSlotStore` without
 * throwing: the map goes to `undefined`, `markColumnsChanged` then finds nothing to
 * write, and every subscriber still on the deleted identity goes silent for the
 * life of the collection.
 */
describe('a column identity is given back only by the thing that is still filed', () => {
    it('a second dispose of an effect leaves the column identity filed since alone', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        const first = OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        OIMEffectService.INSTANCE.disposeEffect(first);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(slot.columnSlotStore).toBeUndefined();

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'title')], [], () => { runs++; });
        db.flush();
        const born = runs;
        const live = (slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title');
        expect(live).toBeDefined();

        OIMEffectService.INSTANCE.disposeEffect(first);

        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title')).toBe(live);

        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'B', rank: 1 });
        db.flush();
        expect(runs).toBe(born + 1);
    });

    /**
     * A HOLD IS A REFERENCE HERE TOO. `OIMColumnOwner.hold` names three kinds that take a
     * hold and the column slot is one of them; `mintUnfiledColumnSlot` mints with
     * `holdCount: 0` for exactly that reason. A `releaseSlotIfUnheld` that asks
     * only `effects` unfiles, on the last subscriber leaving, an identity
     * somebody is holding — after which the next `mintUnfiledColumnSlot` mints a SECOND
     * identity for the same column and the holder is left on an orphan nothing
     * writes to again.
     */
    it('declines a release while something holds the identity', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        const title = cardsService.holdColumn(slot, 'title');

        const effect = OIMEffectService.INSTANCE.createEffect(db,[cardsService.getColumn(slot, 'title')], [], () => { /* nothing */ });
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title')).toBe(title);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        expect(title.holdCount).toBe(1);
        expect((slot.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.get('title')).toBe(title);
        expect(cardsService.getColumn(slot, 'title')).toBe(title);

        // The other direction, or the term would be a leak with a nice name.
        cardsService.unholdColumn(title);
        expect(slot.columnSlotStore).toBeUndefined();
    });

    // A column slot is reachable from nowhere but its entity slot's store, so
    // `OIMSlotOwnerService.isReleasable` asks whether that store stands.
    it('keeps a removed slot filed while something holds one of its columns', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.slotContentService.upsertEntity(cards,{ id: 'a', title: 'A', rank: 1 });
        const slot = cardsService.getSlotByKey(cards,'a')!;

        const title = cardsService.holdColumn(slot, 'title');
        // Nobody is listening: the hold is the only reference in this sequence.
        expect(title.effects).toBeUndefined();

        cardsService.slotContentService.deleteEntity(slot);

        expect(cardsService.getSlotByKey(cards,'a')).toBe(slot);

        cardsService.unholdColumn(title);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});
