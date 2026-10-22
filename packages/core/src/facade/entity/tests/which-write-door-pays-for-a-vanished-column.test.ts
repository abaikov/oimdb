import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMSingleEntityService } from '../../../factories/createOIMSingleEntityService';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';

type TCard = { id: string; title: string; deckId: string; rank: number };
type TCardWithoutRank = Omit<TCard, 'rank'>;

const aCard = (): TCard => ({ id: 'c1', title: 'A', deckId: 'd1', rank: 1 });
const sameCardWithoutRank = (): TCardWithoutRank => ({ id: 'c1', title: 'A', deckId: 'd1' });

const makeCards = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cards, cardsService };
};

const countingProbes = <T extends object>(source: T, probes: { count: number }): T =>
    new Proxy(source, {
        getOwnPropertyDescriptor(target, name) {
            probes.count++;
            return Object.getOwnPropertyDescriptor(target, name);
        },
    });

describe('which write door pays for a vanished column', () => {
    it('drops the column a whole-row upsert no longer carries', () => {
        const { db, cards, cardsService } = makeCards();
        cardsService.slotContentService.upsertEntity(cards, aCard());
        db.flush();

        cardsService.slotContentService.upsertEntity(cards, sameCardWithoutRank() as TCard);
        db.flush();

        expect((cardsService.getSlotByKey(cards, 'c1').entity as { rank?: number }).rank).toBeUndefined();
    });

    it('keeps every column a patch does not name', () => {
        const { db, cards, cardsService } = makeCards();
        cardsService.slotContentService.upsertEntity(cards, aCard());
        db.flush();

        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), { title: 'B' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1').entity).toEqual({
            id: 'c1', title: 'B', deckId: 'd1', rank: 1,
        });
    });

    it('walks a whole-row write twice over the stored columns, and a patch once over the named ones', () => {
        const { db, cards, cardsService } = makeCards();
        cardsService.slotContentService.upsertEntity(cards, aCard());
        db.flush();

        const upsertProbes = { count: 0 };
        cardsService.slotContentService.upsertEntity(cards, countingProbes(aCard(), upsertProbes));
        db.flush();

        const patchProbes = { count: 0 };
        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), countingProbes({ title: 'B', rank: 2 }, patchProbes));
        db.flush();

        expect({ upsert: upsertProbes.count, patch: patchProbes.count })
            .toEqual({ upsert: 8, patch: 2 });
    });

    it('answers the same on a single entity: replace drops it, update keeps it', () => {
        const db = new OIMDB();
        const replacedService = createOIMSingleEntityService<TCard>(db);
        const replaced = replacedService.createStoreSlot(db);
        replacedService.slotContentService.upsertEntity(replaced, aCard());
        const patchedService = createOIMSingleEntityService<TCard>(db);
        const patched = patchedService.createStoreSlot(db);
        patchedService.slotContentService.upsertEntity(patched, aCard());
        db.flush();

        replacedService.slotContentService.writeEntity(replacedService.getSingleSlot(replaced), sameCardWithoutRank() as TCard);
        patchedService.slotContentService.updateEntity(patchedService.getSingleSlot(patched), { title: 'B' });
        db.flush();

        expect((replacedService.getSingleSlot(replaced).entity as { rank?: number }).rank).toBeUndefined();
        expect(patchedService.getSingleSlot(patched).entity).toEqual({ id: 'c1', title: 'B', deckId: 'd1', rank: 1 });
    });
});
