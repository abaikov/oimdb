import {
    OIMDB,
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterUnhold,
    OIMSlotReleasePolicyAfterWrite,
    OIMSlotReleasePolicyAtEmpty,
    OIMSlotReleasePolicyAtUnhold,
    OIMSlotReleasePolicyEarliest,
    OIMSlotReleasePolicyNever,
    createOIMEntityService,
    oimIsSlotReleased,
} from '../../../index';
import type { IOIMSlotReleasePolicy } from '../../../index';

type TCard = { id: string; title: string };

const POLICIES: [string, () => IOIMSlotReleasePolicy, boolean][] = [
    ['at empty', () => new OIMSlotReleasePolicyAtEmpty(), false],
    ['never', () => new OIMSlotReleasePolicyNever(), false],
    ['at unhold', () => new OIMSlotReleasePolicyAtUnhold(), true],
    ['after write', () => new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 1_000 }), true],
    ['after idle', () => new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: 1_000 }), true],
    ['after unhold', () => new OIMSlotReleasePolicyAfterUnhold({ keepAfterUnholdMs: 1_000 }), true],
    ['earliest of at empty and never', () => new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAtEmpty(), new OIMSlotReleasePolicyNever(),
    ]), false],
    ['earliest of at empty and at unhold', () => new OIMSlotReleasePolicyEarliest([
        new OIMSlotReleasePolicyAtEmpty(), new OIMSlotReleasePolicyAtUnhold(),
    ]), true],
];

const cardsUnder = (slotReleasePolicy: IOIMSlotReleasePolicy) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id, slotReleasePolicy });
    return { cardsService, cards: cardsService.createStoreSlot(db) };
};

describe('which policy releases a written slot', () => {
    it.each(POLICIES)('%s answers releasesWrittenSlots', (_, slotReleasePolicyFor, releasesWrittenSlots) => {
        expect(slotReleasePolicyFor().releasesWrittenSlots).toBe(releasesWrittenSlots);
    });

    it('at empty keeps a written slot nobody holds, through an insert, a rewrite and a patch', () => {
        const { cardsService, cards } = cardsUnder(new OIMSlotReleasePolicyAtEmpty());

        cardsService.slotContentService.insertEntities(cards, [{ id: 'c2', title: 'four' }]);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'two' });
        cardsService.slotContentService.updateEntity(card, { title: 'three' });

        expect(oimIsSlotReleased(card)).toBe(false);
        expect(cardsService.slotContentService.findEntityByKey(cards, 'c1')?.title).toBe('three');
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(true);
    });

    it('at unhold releases a written slot nobody holds, right after the write', () => {
        const { cardsService, cards } = cardsUnder(new OIMSlotReleasePolicyAtUnhold());

        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        cardsService.slotContentService.insertEntities(cards, [{ id: 'c2', title: 'two' }]);

        expect(oimIsSlotReleased(card)).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(false);
    });
});
