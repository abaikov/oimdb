import { OIMDB, OIMSlotAfterIdleReleasePolicy, OIMSlotAfterUnholdReleasePolicy, OIMSlotAfterWriteReleasePolicy, OIMSlotAtEmptyReleasePolicy, OIMSlotAtUnholdReleasePolicy, OIMSlotEarliestReleasePolicy, OIMSlotNeverReleasePolicy, isOIMSlotReleased } from '../../index';
import type { IOIMSlotReleasePolicy } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const POLICIES: [string, () => IOIMSlotReleasePolicy, boolean][] = [
    ['at empty', () => new OIMSlotAtEmptyReleasePolicy(), false],
    ['never', () => new OIMSlotNeverReleasePolicy(), false],
    ['at unhold', () => new OIMSlotAtUnholdReleasePolicy(), true],
    ['after write', () => new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 1_000 }), true],
    ['after idle', () => new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 1_000 }), true],
    ['after unhold', () => new OIMSlotAfterUnholdReleasePolicy({ keepAfterUnholdMs: 1_000 }), true],
    ['earliest of at empty and never', () => new OIMSlotEarliestReleasePolicy([
        new OIMSlotAtEmptyReleasePolicy(), new OIMSlotNeverReleasePolicy(),
    ]), false],
    ['earliest of at empty and at unhold', () => new OIMSlotEarliestReleasePolicy([
        new OIMSlotAtEmptyReleasePolicy(), new OIMSlotAtUnholdReleasePolicy(),
    ]), true],
];

const cardsUnder = (slotReleasePolicy: IOIMSlotReleasePolicy) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>(), slotReleasePolicy });
    return { cardsService, cards: cardsService.createStoreSlot(db) };
};

describe('which policy releases a written slot', () => {
    it.each(POLICIES)('%s answers releasesWrittenSlots', (_, slotReleasePolicyFor, releasesWrittenSlots) => {
        expect(slotReleasePolicyFor().releasesWrittenSlots).toBe(releasesWrittenSlots);
    });

    it('at empty keeps a written slot nobody holds, through an insert, a rewrite and a patch', () => {
        const { cardsService, cards } = cardsUnder(new OIMSlotAtEmptyReleasePolicy());

        cardsService.writeInBatch(cards, () => ([{ id: 'c2', title: 'four' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'two' });
        cardsService.slotContentService.updateEntity(card, { title: 'three' });

        expect(isOIMSlotReleased(card)).toBe(false);
        expect(cardsService.peekSlotByKey(cards, 'c1')?.entity?.title).toBe('three');
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(true);
    });

    it('at unhold releases a written slot nobody holds, right after the write', () => {
        const { cardsService, cards } = cardsUnder(new OIMSlotAtUnholdReleasePolicy());

        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        cardsService.writeInBatch(cards, () => ([{ id: 'c2', title: 'two' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        expect(isOIMSlotReleased(card)).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(false);
    });
});
