import { OIMDB } from '../../db/OIMDB';
import { OIMSlotTreeStoreService } from '../../store/OIMSlotTreeStoreService';
import { OIMScalarKeyTreeWalk } from '../OIMScalarKeyTreeWalk';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TPageKey = readonly (TOIMStoreKey | null | undefined)[];
type TPage = { rows: number };

const createFixture = () => {
    const db = new OIMDB();
    const pagesService = createOIMSlotCollectionService({
        slotContentService: createOIMEntityContentService<TPage, TPageKey>(),
        slotStoreService: new OIMSlotTreeStoreService<TOIMStoreKey | null | undefined, TOIMEntitySlot<TPage, TPageKey>>(OIMScalarKeyTreeWalk.INSTANCE),
    });
    return { pagesService, pages: pagesService.createStoreSlot(db) };
};

describe('a scalar composite key with empty parts', () => {
    it('files undefined and null parts as keys of their own', () => {
        const { pagesService, pages } = createFixture();
        pagesService.writeSlotContentByKey(pages, ['runs', undefined, 50], { rows: 1 });
        pagesService.writeSlotContentByKey(pages, ['runs', null, 50], { rows: 2 });
        pagesService.writeSlotContentByKey(pages, ['runs', 'failed', 50], { rows: 3 });

        expect(pagesService.getSlotByKey(pages, ['runs', undefined, 50]).entity).toEqual({ rows: 1 });
        expect(pagesService.getSlotByKey(pages, ['runs', null, 50]).entity).toEqual({ rows: 2 });
        expect(pagesService.getSlotByKey(pages, ['runs', 'failed', 50]).entity).toEqual({ rows: 3 });
        expect(pagesService.getSlotCount(pages)).toBe(3);
    });

    it('resolves a fresh tuple with the same empty parts to the same slot', () => {
        const { pagesService, pages } = createFixture();
        const heldSlot = pagesService.holdSlotByKey(pages, ['runs', undefined, undefined]);
        expect(pagesService.peekSlotByKey(pages, ['runs', undefined, undefined])).toBe(heldSlot);
        expect(pagesService.peekSlotByKey(pages, ['runs', undefined])).toBeUndefined();
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('files the key with no parts at the root, apart from a key of one empty part', () => {
        const { pagesService, pages } = createFixture();
        pagesService.writeSlotContentByKey(pages, [], { rows: 0 });
        pagesService.writeSlotContentByKey(pages, [undefined], { rows: 1 });

        expect(pagesService.getSlotByKey(pages, []).entity).toEqual({ rows: 0 });
        expect(pagesService.getSlotByKey(pages, [undefined]).entity).toEqual({ rows: 1 });
        expect(pagesService.getSlotCount(pages)).toBe(2);
    });
});
