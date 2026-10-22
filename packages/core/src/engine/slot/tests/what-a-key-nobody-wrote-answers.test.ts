import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TRow = { id: string; n: number };

const rowsOf = (db: OIMDB) => {
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    return { rowsService, rows: rowsService.createStoreSlot(db) };
};

const bucketsOf = (db: OIMDB) => {
    const bucketsService = createOIMBucketService<
        TOIMEntitySlot<TRow, TOIMStoreKey>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow, TOIMStoreKey>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow, TOIMStoreKey>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow, TOIMStoreKey>>() });
    return { bucketsService, buckets: bucketsService.createStoreSlot(db) };
};

describe('what a key nobody wrote answers', () => {
    it('says a key is not there after a read minted an identity under it', () => {
        const { rowsService, rows } = rowsOf(new OIMDB());

        rowsService.getSlotByKey(rows, 'r1');

        expect(rowsService.hasSlotContentByKey(rows, 'r1')).toBe(false);
    });

    it('says a key is not there after a hold minted an identity under it', () => {
        const { rowsService, rows } = rowsOf(new OIMDB());

        rowsService.holdSlotByKey(rows, 'r1');

        expect(rowsService.hasSlotContentByKey(rows, 'r1')).toBe(false);
    });

    it('says a key is there once content landed, and not there once it is gone', () => {
        const { rowsService, rows } = rowsOf(new OIMDB());

        const row = rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        expect(rowsService.hasSlotContentByKey(rows, 'r1')).toBe(true);

        rowsService.slotContentService.deleteEntity(row);
        expect(rowsService.hasSlotContentByKey(rows, 'r1')).toBe(false);
    });

    it('says a bucket is not there while it carries no slot', () => {
        const db = new OIMDB();
        const { rowsService, rows } = rowsOf(db);
        const { bucketsService, buckets } = bucketsOf(db);
        const row = rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });

        const bucket = bucketsService.holdSlotByKey(buckets, 'b1');
        expect(bucketsService.hasSlotContentByKey(buckets, 'b1')).toBe(false);

        bucketsService.slotContentService.addBucketMemberSlots(bucket, [row]);
        expect(bucketsService.hasSlotContentByKey(buckets, 'b1')).toBe(true);
    });
});
