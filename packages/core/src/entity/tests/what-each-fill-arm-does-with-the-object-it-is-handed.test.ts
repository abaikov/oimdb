import { OIMDB } from '../../db/OIMDB';
import { createOIMInPlaceEntityWriter } from '../createOIMInPlaceEntityWriter';
import { createOIMReplacingEntityWriter } from '../createOIMReplacingEntityWriter';
import { insertOIMEntityWithoutCopy } from '../utils/insertOIMEntityWithoutCopy';
import { insertOIMEntityWithCopy } from '../utils/insertOIMEntityWithCopy';
import type { TOIMEntityInserter } from '../types/TOIMEntityInserter';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const collectionWith = (entityInserter: TOIMEntityInserter) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>({ entityWriter: createOIMInPlaceEntityWriter({ entityInserter }) }) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('what each fill arm does with the object it is handed', () => {
    it('copies, so the caller cannot reach into the slot afterwards', () => {
        const { db, cardsService, cards } = collectionWith(insertOIMEntityWithCopy);
        const handed: TCard = { id: 'c1', title: 'one' };

        const slot = cardsService.writeSlotContentByKey(cards, handed.id, handed);
        db.flush();
        handed.title = 'edited behind the engine';

        expect(slot.entity).not.toBe(handed);
        expect(slot.entity?.title).toBe('one');
    });

    it('stores the object itself, so the caller holds the slot content', () => {
        const { db, cardsService, cards } = collectionWith(insertOIMEntityWithoutCopy);
        const handed: TCard = { id: 'c1', title: 'one' };

        const slot = cardsService.writeSlotContentByKey(cards, handed.id, handed);
        db.flush();

        expect(slot.entity).toBe(handed);
    });

    it('is the arm the writer was built with, and not a shared body below the fork', () => {
        expect(createOIMInPlaceEntityWriter({ entityInserter: insertOIMEntityWithCopy }).fillEntity)
            .toBe(insertOIMEntityWithCopy);
        expect(createOIMReplacingEntityWriter({ entityInserter: insertOIMEntityWithCopy }).fillEntity)
            .toBe(insertOIMEntityWithCopy);
    });

    it('lets each arm pick an arm independently of how it updates', () => {
        const inPlaceWithoutCopy = createOIMInPlaceEntityWriter({ entityInserter: insertOIMEntityWithoutCopy });
        const replacingWithCopy = createOIMReplacingEntityWriter({ entityInserter: insertOIMEntityWithCopy });

        expect(inPlaceWithoutCopy.fillEntity).toBe(insertOIMEntityWithoutCopy);
        expect(inPlaceWithoutCopy.patchEntity).not.toBe(replacingWithCopy.patchEntity);
        expect(replacingWithCopy.fillEntity).toBe(insertOIMEntityWithCopy);
    });

    it('still takes a held comparator through the same options object', () => {
        const caseless = (a: unknown, b: unknown): boolean =>
            typeof a === 'string' && typeof b === 'string'
                ? a.toLowerCase() === b.toLowerCase()
                : a === b;
        const writer = createOIMInPlaceEntityWriter({ sameValueGuard: caseless, entityInserter: insertOIMEntityWithoutCopy });
        const slot = { content: { id: 'c1', title: 'one' } } as unknown as Parameters<
            typeof writer.patchEntity
        >[0];

        expect(writer.patchEntity(slot, { title: 'ONE' }, undefined)).toBe(false);
        const changedColumnNames: string[] = [];
        expect(writer.patchEntity(slot, { title: 'two' }, changedColumnNames)).toBe(true);
        expect(changedColumnNames).toEqual(['title']);
    });
});
