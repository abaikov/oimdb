import type { TOIMColumnSlot } from '../src/engine/column/types/TOIMColumnSlot';
/**
 * WHAT KEEPS AN IDENTITY THAT NOBODY HOLDS AND NOTHING VALUES: a column of it
 * that something refers to.
 */
import { OIMEffectService } from '../src/engine/computed/OIMEffectService';
import type { TOIMEffect } from '../src/engine/computed/types/TOIMEffect';
import { OIMUnusedSlotCollectorService } from '../src/engine/collector/OIMUnusedSlotCollectorService';
import { OIMDB } from '../src/factories/OIMDB';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import type { IOIMSlotStamp } from '../src/engine/slot/interfaces/IOIMSlotStamp';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../src/engine/store/types/TOIMStoreKey';
import type { TOIMStoreSlot } from '../src/engine/slot/types/TOIMStoreSlot';
import type { TOIMSlot } from '../src/engine/slot/types/TOIMSlot';
import { oimIsSlotEmpty } from '../src/engine/slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../src/engine/slot/utils/oimIsSlotReleased';

describe('a subscribed column keeps its slot', () => {
    type TCard = { status?: string; title?: string; assignee?: string };
    type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

    const plantAnEmptyRow = {
        stamp(slot: { entity: TCard | undefined }): void { slot.entity ??= {}; },
    } as unknown as IOIMSlotStamp<TOIMSlot>;

    const carriesNoColumn = {
        isEmpty: (slot: TCardSlot): boolean => {
            const entity = slot.entity;
            if (entity === undefined) return true;
            for (const _name in entity) return false;
            return true;
        },
    };

    const createFixture = () => {
        const db = new OIMDB({ slotStamp: plantAnEmptyRow });
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMEntityService<TCard>(db, {
            keyOf: (card: TCard) => card.title ?? '',
            slotEmptiness: carriesNoColumn,
        });
        const cards = cardsService.createStoreSlot(db);
        return { db, cardsService, cards, effectService };
    };

    /**
     * A DEPENDENT BUILT THROUGH THE ENGINE'S OWN DOOR, forced rather than
     * chosen: {@link OIMEffectService.createEffect} is the only way a {@link TOIMEffect} is
     * constructed — it needs the frame, the clock, the enlist and the arming,
     * all four private to the channel.
     */
    const aDependentOn = (db: OIMDB, effectService: OIMEffectService, source: TOIMSlot): TOIMEffect =>
        effectService.createEffect(db, [source], [], () => undefined);

    /** A slot of a collection, with a value, referred to by nothing. */
    const aCardIn = (
        cardsService: ReturnType<typeof createFixture>['cardsService'],
        cards: TOIMStoreSlot<Map<TOIMStoreKey, TCardSlot>, TCardSlot, Partial<TCard>>,
        key: string,
    ): TCardSlot =>
        cardsService.slotContentService.insertEntity(cards, key, { status: 'open' });

    /**
     * THE FAILING SEQUENCE, IN ORDER. Every other term is asserted to be silent
     * first, because the point is not that the slot survives — it is that the
     * slot survives on the strength of the COLUMN term and nothing else. A slot
     * that happened to keep a hold would pass this test while the defect was
     * still in place.
     */
    it('does not let go of a removed card while something is on one of its columns', () => {
        const { db, cardsService, cards, effectService } = createFixture();
        const card = aCardIn(cardsService, cards, 'card-1');

        const status = cardsService.getColumn(card, 'status');
        aDependentOn(db, effectService, status);

        cardsService.slotContentService.deleteEntity(card);

        expect(oimIsSlotEmpty(card)).toBe(true);
        expect(card.holdCount).toBe(0);
        expect(card.effects).toBeUndefined();
        expect(card.columnSlotStore !== undefined).toBe(true);
        expect(cardsService.getSlotByKey(cards, 'card-1')).toBe(card);
    });

    /**
     * AND THE CASCADE THE OTHER WAY. The column slot's owner IS the service that
     * minted it, and that service drops the entry, drops the map with it and
     * asks the card's owner in turn. Nothing here reaches into `effects` by hand.
     */
    it('lets go of the card once the last column subscriber leaves', () => {
        const { db, cardsService, cards, effectService } = createFixture();
        const card = aCardIn(cardsService, cards, 'card-1');

        const status = cardsService.getColumn(card, 'status');
        const effect = aDependentOn(db, effectService, status);
        cardsService.slotContentService.deleteEntity(card);
        expect(cardsService.getSlotByKey(cards, 'card-1')).toBe(card);

        effectService.disposeEffect(effect);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        expect(card.columnSlotStore).toBeUndefined();
        expect(card.columnSlotStore !== undefined).toBe(false);
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    /**
     * A COLUMN SLOT IS NOT ITSELF A REFERENCE — being referred to is. The map can
     * outlive its last listener for as long as it takes whoever noticed to hand
     * the slot back, and a card must not be pinned by an entry nothing is on.
     */
    it('is not kept alive by a column slot nobody is on', () => {
        const { db, cardsService, cards } = createFixture();
        const card = aCardIn(cardsService, cards, 'card-1');

        cardsService.getColumn(card, 'status');
        cardsService.getColumn(card, 'title');

        expect((card.columnSlotStore as Map<string, TOIMColumnSlot> | undefined)?.size).toBe(2);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(card.columnSlotStore !== undefined).toBe(false);

        cardsService.slotContentService.deleteEntity(card);
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    /**
     * A HELD COLUMN SLOT IS A REFERENCE TOO, and this is the case that was
     * missing: a listener is not the only reference a column slot can have, and
     * a held column with no listener once answered NO — after which its card
     * could be unfiled out from under the holder.
     */
    it('is kept alive by a column slot somebody holds and nobody listens to', () => {
        const { db, cardsService, cards } = createFixture();
        const card = aCardIn(cardsService, cards, 'card-1');

        const status = cardsService.holdColumn(card, 'status');
        cardsService.slotContentService.deleteEntity(card);

        expect(status.effects).toBeUndefined();
        expect(card.columnSlotStore !== undefined).toBe(true);
        expect(cardsService.getSlotByKey(cards, 'card-1')).toBe(card);

        cardsService.unholdColumn(status);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(oimIsSlotReleased(card)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    /**
     * ONE REFERRED-TO COLUMN AMONG SEVERAL IS ENOUGH, which is what makes the
     * term a walk rather than a field read. A predicate that stopped at the first
     * entry of the map — or looked only at the one column a caller happened to
     * name — would pass everything above.
     */
    it('is kept alive by any one of its columns, not only the first', () => {
        const { db, cardsService, cards, effectService } = createFixture();
        const card = aCardIn(cardsService, cards, 'card-1');

        cardsService.getColumn(card, 'status');
        cardsService.getColumn(card, 'title');
        const assignee = cardsService.getColumn(card, 'assignee');
        aDependentOn(db, effectService, assignee);

        cardsService.slotContentService.deleteEntity(card);
        // Without this the predicate is `columnSlotStore !== undefined` over a map
        // nothing has swept, which is true whichever column was subscribed.
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        expect(Array.from((card.columnSlotStore as Map<string, TOIMColumnSlot>).keys())).toEqual(['assignee']);
        expect(card.columnSlotStore !== undefined).toBe(true);
        expect(cardsService.getSlotByKey(cards, 'card-1')).toBe(card);
    });

    /**
     * AND A CARD THAT STILL HOLDS A VALUE IS NEVER ASKED AT ALL — the guard the
     * aggregate returns on before reaching either predicate, so that the walk
     * this term added is not on the path a live card takes.
     */
    it('is not asked about a card that still holds a value', () => {
        const { cardsService, cards } = createFixture();
        const card = aCardIn(cardsService, cards, 'card-1');

        card.owner.releaseSlotIfUnheld(card);
        expect(cardsService.getSlotByKey(cards, 'card-1')).toBe(card);
    });

    /**
     * AND THE STALE-SLOT GUARD, which is the aggregate's third question and has
     * nothing to do with any term: a slot that was unfiled, whose key was written
     * again, must not take the LIVE identity down with it when its last holder
     * lets go.
     */
    it('does not unfile the live identity when a stale one is released', () => {
        const { cardsService, cards } = createFixture();
        const first = aCardIn(cardsService, cards, 'card-1');
        cardsService.slotContentService.deleteEntity(first);
        expect(oimIsSlotReleased(first)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);

        const second = aCardIn(cardsService, cards, 'card-1');
        expect(second).not.toBe(first);

        first.owner.releaseSlotIfUnheld(first);
        expect(cardsService.getSlotByKey(cards, 'card-1')).toBe(second);
    });
});
