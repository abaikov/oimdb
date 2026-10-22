import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityWriterReplacing } from '../../../factories/createOIMEntityWriterReplacing';
import { oimInsertEntityWithoutCopy } from '../utils/oimInsertEntityWithoutCopy';
import { oimInsertEntityWithCopy } from '../utils/oimInsertEntityWithCopy';
import type { TOIMEntityInsertStrategy } from '../types/TOIMEntityInsertStrategy';

type TCard = { id: string; title: string };

const collectionWith = (entityInsertStrategy: TOIMEntityInsertStrategy) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        entityWriter: createOIMEntityWriterInPlace({ entityInsertStrategy }),
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('what each fill arm does with the object it is handed', () => {
    it('copies, so the caller cannot reach into the slot afterwards', () => {
        const { db, cardsService, cards } = collectionWith(oimInsertEntityWithCopy);
        const handed: TCard = { id: 'c1', title: 'one' };

        const slot = cardsService.slotContentService.upsertEntity(cards, handed);
        db.flush();
        handed.title = 'edited behind the engine';

        expect(slot.entity).not.toBe(handed);
        expect(slot.entity?.title).toBe('one');
    });

    it('stores the object itself, so the caller holds the slot content', () => {
        const { db, cardsService, cards } = collectionWith(oimInsertEntityWithoutCopy);
        const handed: TCard = { id: 'c1', title: 'one' };

        const slot = cardsService.slotContentService.upsertEntity(cards, handed);
        db.flush();

        expect(slot.entity).toBe(handed);
    });

    it('is the arm the writer was built with, and not a shared body below the fork', () => {
        expect(createOIMEntityWriterInPlace().fillEntity).toBe(oimInsertEntityWithoutCopy);
        expect(createOIMEntityWriterReplacing().fillEntity).toBe(oimInsertEntityWithoutCopy);
        expect(createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithCopy }).fillEntity)
            .toBe(oimInsertEntityWithCopy);
        expect(createOIMEntityWriterReplacing({ entityInsertStrategy: oimInsertEntityWithCopy }).fillEntity)
            .toBe(oimInsertEntityWithCopy);
    });

    it('lets each arm pick an arm independently of how it updates', () => {
        const inPlaceWithoutCopy = createOIMEntityWriterInPlace({ entityInsertStrategy: oimInsertEntityWithoutCopy });
        const replacingWithCopy = createOIMEntityWriterReplacing({ entityInsertStrategy: oimInsertEntityWithCopy });

        expect(inPlaceWithoutCopy.fillEntity).toBe(oimInsertEntityWithoutCopy);
        expect(inPlaceWithoutCopy.patchEntity).not.toBe(replacingWithCopy.patchEntity);
        expect(replacingWithCopy.fillEntity).toBe(oimInsertEntityWithCopy);
    });

    it('still takes a held comparator through the same options object', () => {
        const caseless = (a: unknown, b: unknown): boolean =>
            typeof a === 'string' && typeof b === 'string'
                ? a.toLowerCase() === b.toLowerCase()
                : a === b;
        const writer = createOIMEntityWriterInPlace({ sameValueGuard: caseless, entityInsertStrategy: oimInsertEntityWithoutCopy });
        const slot = { entity: { id: 'c1', title: 'one' } } as unknown as Parameters<
            typeof writer.patchEntity
        >[0];

        expect(writer.patchEntity(slot, { title: 'ONE' }, undefined)).toBe(false);
        const changedColumnNames: string[] = [];
        expect(writer.patchEntity(slot, { title: 'two' }, changedColumnNames)).toBe(true);
        expect(changedColumnNames).toEqual(['title']);
    });
});
