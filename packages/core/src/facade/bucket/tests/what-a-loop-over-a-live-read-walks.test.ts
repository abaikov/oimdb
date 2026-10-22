import { OIMDB, createOIMBucketService, createOIMEntityService } from '../../../index';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';

type TCard = { id: string; title: string };
type TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TCard>>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const listsService = createOIMBucketService<TOIMEntitySlot<TCard>, TOIMStoreKey, TSlots>(db);
    const listsContentService = listsService.slotContentService;
    const lists = listsService.createStoreSlot(db);
    const card =(id: string): TOIMEntitySlot<TCard, TOIMStoreKey> => {
        cardsService.slotContentService.upsertEntity(cards, { id, title: id.toUpperCase() });
        db.flush();
        return cardsService.getSlotByKey(cards, id);
    };
    const ids = (bucket: TBucket): string[] => {
        const out: string[] = [];
        for (const slot of Array.from(listsContentService.getBucketMemberSlots(bucket))) out.push(slot.entity?.id as string);
        return out;
    };
    const filled = (bucket: TBucket): void => {
        listsContentService.writeBucketMemberSlots(bucket, [card('a'), card('b'), card('c')]);
        db.flush();
    };
    return { db, listsService, listsContentService, lists, filled, ids };
};

describe('a loop over a live read, with a body that writes', () => {
    it('hands back the container the service keeps, not a copy of it', () => {
        const fixture = createFixture();
        const bucket = fixture.listsService.holdSlotByKey(fixture.lists, 'list');
        fixture.filled(bucket);

        const first = fixture.listsContentService.getBucketMemberSlots(bucket);
        const second = fixture.listsContentService.getBucketMemberSlots(bucket);

        expect(first).toBe(second);
    });

    it('skips a slot per removal when the body removes what the loop is walking', () => {
        const fixture = createFixture();
        const bucket = fixture.listsService.holdSlotByKey(fixture.lists, 'list');
        fixture.filled(bucket);

        const visited: string[] = [];
        for (const slot of fixture.listsContentService.getBucketMemberSlots(bucket)) {
            visited.push(slot.entity?.id as string);
            fixture.listsContentService.removeBucketMemberSlots(bucket, [slot]);
        }
        fixture.db.flush();

        expect(visited).toEqual(['a', 'c']);
        expect(fixture.ids(bucket)).toEqual(['b']);
        expect(fixture.listsContentService.getBucketMemberSlotCount(bucket)).toBe(1);
    });

    it('walks every slot when the caller copies first, which is what the docs tell them to do', () => {
        const fixture = createFixture();
        const bucket = fixture.listsService.holdSlotByKey(fixture.lists, 'list');
        fixture.filled(bucket);

        const visited: string[] = [];
        for (const slot of Array.from(fixture.listsContentService.getBucketMemberSlots(bucket))) {
            visited.push(slot.entity?.id as string);
            fixture.listsContentService.removeBucketMemberSlots(bucket, [slot]);
        }
        fixture.db.flush();

        expect(visited).toEqual(['a', 'b', 'c']);
        expect(fixture.ids(bucket)).toEqual([]);
        expect(fixture.listsContentService.getBucketMemberSlotCount(bucket)).toBe(0);
    });
});
