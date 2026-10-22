import { OIMSlotContentBucketServiceSetDriven } from '../OIMSlotContentBucketServiceSetDriven';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../../engine/collector/OIMUnusedSlotCollectorService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

function createFixture() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: (card) => card.id });
    const listService = createOIMBucketService<TCardSlot, TOIMStoreKey, TSlots>(db);
    const listContentService = listService.slotContentService;
    const cards = cardsService.createStoreSlot(db);
    const list = listService.createStoreSlot(db);
    for (const id of ['a', 'b', 'c', 'd', 'e']) cardsService.slotContentService.upsertEntity(cards, { id });
    db.flush();
    const heldSlot = listService.holdSlotByKey(list, 'l');
    const bucket = heldSlot;
    const row = (id: string): TOIMEntitySlot<TCard, TOIMStoreKey> => cardsService.getSlotByKey(cards, id);
    const flushUnusedSlotCollector = (): void => {
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
    };
    const letGoOfBucket = (): void => { heldSlot.owner.unholdSlot(heldSlot); };
    const append = (slot: TOIMEntitySlot<TCard, TOIMStoreKey>): void => {
        listContentService.insertBucketMemberSlotAt(bucket, listContentService.getBucketMemberSlotCount(bucket), slot);
    };
    const ids = () => Array.from(listContentService.getBucketMemberSlots(bucket)).map(s => s.entity?.id ?? '?').join('');
    return { db, effectService, cardsService, cards, listService, listContentService, list, bucket, row, ids, append, flushUnusedSlotCollector, letGoOfBucket };
}

describe('what each positional edit does to a list', () => {
    it('append, then insert at a position', () => {
        const { db, listContentService, bucket, row, ids, append } = createFixture();
        append(row('a'));
        append(row('b'));
        listContentService.insertBucketMemberSlotAt(bucket, 1, row('c'));
        db.flush();
        expect(ids()).toBe('acb');
    });

    it('insert past the end appends; below zero goes first', () => {
        const { db, listContentService, bucket, row, ids } = createFixture();
        listContentService.insertBucketMemberSlotAt(bucket, 99, row('a'));
        listContentService.insertBucketMemberSlotAt(bucket, -5, row('b'));
        db.flush();
        expect(ids()).toBe('ba');
    });

    it('removeAt and removeRange, and the holds go with them', () => {
        const { db, listContentService, bucket, row, ids, append } = createFixture();
        for (const id of ['a', 'b', 'c', 'd']) append(row(id));
        listContentService.removeBucketMemberSlotAt(bucket, 1);
        db.flush();
        expect(ids()).toBe('acd');
        listContentService.removeBucketMemberSlotRange(bucket, 1, 2);
        db.flush();
        expect(ids()).toBe('a');
        expect(row('b').holdCount).toBe(0);
        expect(row('c').holdCount).toBe(0);
        expect(row('a').holdCount).toBe(1);
    });

    it('move and moveRange keep every slot and change only order', () => {
        const { db, listContentService, bucket, row, ids, append } = createFixture();
        for (const id of ['a', 'b', 'c', 'd', 'e']) append(row(id));
        listContentService.moveBucketMemberSlotToPosition(bucket, 0, 2);
        db.flush();
        expect(ids()).toBe('bcade');
        listContentService.moveBucketMemberSlotRangeToPosition(bucket, 0, 2, 3);
        db.flush();
        expect(ids()).toBe('adebc');
        expect(listContentService.getBucketMemberSlotCount(bucket)).toBe(5);
    });

    it('clear asks whether the identities it let go may go', () => {
        const { listContentService, cardsService, cards, bucket, row, append, flushUnusedSlotCollector } = createFixture();
        const base = cardsService.getSlotCount(cards);
        append(row('ghost'));
        flushUnusedSlotCollector();
        expect(cardsService.getSlotCount(cards)).toBe(base + 1);

        listContentService.clearBucketMemberSlots(bucket);
        expect(cardsService.getSlotCount(cards)).toBe(base);
    });

    it('removeAt and removeRange ask the same question', () => {
        const { db, listContentService, cardsService, cards, bucket, row, append, flushUnusedSlotCollector } = createFixture();
        const base = cardsService.getSlotCount(cards);

        append(row('g1'));
        listContentService.removeBucketMemberSlotAt(bucket, 0);
        flushUnusedSlotCollector();
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(base);

        append(row('g2'));
        append(row('g3'));
        listContentService.removeBucketMemberSlotRange(bucket, 0, 2);
        flushUnusedSlotCollector();
        db.flush();
        expect(cardsService.getSlotCount(cards)).toBe(base);
    });

    it('clearing empties it, unlinks everyone, and lets the bucket go', () => {
        const { db, listService, listContentService, list, bucket, row, append, letGoOfBucket } = createFixture();
        for (const id of ['a', 'b']) append(row(id));
        db.flush();
        letGoOfBucket();
        listContentService.clearBucketMemberSlots(bucket);
        db.flush();
        expect(row('a').holdCount).toBe(0);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(listService.getSlotCount(list)).toBe(0);
    });

    it('leaves whether a slot is held and where it sits agreeing with the list, without a position map', () => {
        const { db, listContentService: c, bucket, row, append } = createFixture();
        expect(c.hasBucketMemberSlot(bucket, row('a'))).toBe(false);

        append(row('a'));
        append(row('b'));
        append(row('c'));
        db.flush();
        expect(c.hasBucketMemberSlot(bucket, row('a'))).toBe(true);
        expect(c.hasBucketMemberSlot(bucket, row('e'))).toBe(false);
        expect(c.getBucketMemberSlotPosition(bucket, row('c'))).toBe(2);
        expect(c.getBucketMemberSlotPosition(bucket, row('e'))).toBe(-1);
        expect(c.getBucketMemberSlotAt(bucket, 2)).toBe(row('c'));
        expect(c.getBucketMemberSlotAt(bucket, 3)).toBeUndefined();

        c.insertBucketMemberSlotAt(bucket, 0, row('d'));
        db.flush();
        expect(c.getBucketMemberSlotPosition(bucket, row('d'))).toBe(0);
        expect(c.getBucketMemberSlotPosition(bucket, row('a'))).toBe(1);

        c.moveBucketMemberSlotToPosition(bucket, 0, 3);
        db.flush();
        expect(c.getBucketMemberSlotPosition(bucket, row('d'))).toBe(3);
        expect(c.getBucketMemberSlotPosition(bucket, row('a'))).toBe(0);
        expect(c.getBucketMemberSlotAt(bucket, 3)).toBe(row('d'));
        expect(c.getBucketMemberSlotAt(bucket, 0)).toBe(row('a'));

        c.removeBucketMemberSlotAt(bucket, 0);
        db.flush();
        expect(c.hasBucketMemberSlot(bucket, row('a'))).toBe(false);
        expect(c.getBucketMemberSlotPosition(bucket, row('a'))).toBe(-1);
        expect(c.getBucketMemberSlotPosition(bucket, row('b'))).toBe(0);

        c.clearBucketMemberSlots(bucket);
        db.flush();
        expect(c.hasBucketMemberSlot(bucket, row('b'))).toBe(false);
    });

    it('a positional edit wakes the bucket once for the frame', () => {
        const { db, effectService, listContentService, bucket, row, append } = createFixture();
        let woken = 0;
        effectService.createEffect(db, [bucket], [], () => { woken++; });
        db.flush();
        woken = 0;
        append(row('a'));
        append(row('b'));
        listContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        db.flush();
        expect(woken).toBe(1);
    });
});

describe('emptying is not a positional act', () => {
    it('an unordered bucket clears through the base collection', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: (card) => card.id });
        const searchService = createOIMBucketService<
            TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
        const searchContentService = searchService.slotContentService;
        const cards = cardsService.createStoreSlot(db);
        const search = searchService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'a' }, { id: 'b' }]);
        db.flush();

        const heldSlot = searchService.holdSlotByKey(search, 'q');
        searchContentService.writeBucketMemberSlots(heldSlot, [cardsService.getSlotByKey(cards, 'a')!, cardsService.getSlotByKey(cards, 'b')!]);
        heldSlot.owner.unholdSlot(heldSlot);
        db.flush();
        expect(searchContentService.getBucketMemberSlotCount(heldSlot)).toBe(2);

        searchContentService.clearBucketMemberSlots(heldSlot);
        expect(cardsService.getSlotByKey(cards, 'a')!.holdCount).toBe(0);
        expect(oimIsSlotReleased(heldSlot)).toBe(true);
        expect(searchService.getSlotCount(search)).toBe(0);
    });
});

describe('a list whose slots and order are both the caller\'s answers every position door', () => {
    type TTask = { id: string; listId: string };

    it('a list nobody sorts answers every one of them', () => {
        const db = new OIMDB();
        const tasksService = createOIMEntityService<TTask, TOIMEntityColumnName<TTask>, TOIMStoreKey>(db, { keyOf: (task) => task.id });
        const myDayService = createOIMBucketService<TOIMEntitySlot<TTask>, TOIMStoreKey, TOIMBucketSlotsArrayStore<TOIMEntitySlot<TTask>>>(db);
        const myDayContentService = myDayService.slotContentService;
        const tasks = tasksService.createStoreSlot(db);
        const myDay = myDayService.createStoreSlot(db);
        tasksService.slotContentService.upsertEntities(tasks, [
            { id: 't1', listId: 'l1' },
            { id: 't2', listId: 'l1' },
            { id: 't3', listId: 'l1' },
        ]);
        db.flush();
        const bucket = myDayService.holdSlotByKey(myDay, 'ann-today');
        const task = (id: string) => tasksService.getSlotByKey(tasks, id)!;

        myDayContentService.insertBucketMemberSlotAt(bucket, myDayContentService.getBucketMemberSlotCount(bucket), task('t1'));
        myDayContentService.insertBucketMemberSlotAt(bucket, 0, task('t2'));
        myDayContentService.insertBucketMemberSlotAt(bucket, myDayContentService.getBucketMemberSlotCount(bucket), task('t3'));
        myDayContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        myDayContentService.moveBucketMemberSlotRangeToPosition(bucket, 0, 2, 0);
        db.flush();
        expect(myDayContentService.getBucketMemberSlotCount(bucket)).toBe(3);
        expect(myDayContentService.getBucketMemberSlotAt(bucket, 0)).toBe(task('t1'));
        expect(myDayContentService.getBucketMemberSlotPosition(bucket, task('t3'))).toBe(2);

        myDayContentService.removeBucketMemberSlotAt(bucket, 0);
        myDayContentService.removeBucketMemberSlotRange(bucket, 0, 2);
        db.flush();
        expect(task('t1').holdCount).toBe(0);
        bucket.owner.unholdSlot(bucket);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(myDayService.getSlotCount(myDay)).toBe(0);
    });
});
