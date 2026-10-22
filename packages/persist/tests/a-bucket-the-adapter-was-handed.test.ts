import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    OIMErrorPolicyThrowAtOnce,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
    createOIMSingleEntityService,
    oimIsSlotReleased,
} from '@oimdb/core';
import {
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardSlots = TOIMBucketSlotsSetStore<TCardSlot>;
type TSettings = { theme: string };

const ignoreChange = (): void => undefined;

function build(db = new OIMDB()) {
    const entityService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TCardSlots, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'inbox');
    const persistRecordSourceBucketDriven = new OIMPersistRecordSourceBucketDriven({
        channelMap: db,
        entityCollectionService: entityService,
        entityStoreSlot,
        slotContentBucketService: bucketService.slotContentService,
        bucketSlot,
    });
    return {
        db, entityService, entityStoreSlot, bucketService, bucketStoreSlot, bucketSlot, persistRecordSourceBucketDriven,
    };
}

describe('a source handed a channel map of another OIMDB', () => {
    it('is refused at construction, since no change of the persisted services would wake it', () => {
        const { entityService, entityStoreSlot, bucketService, bucketSlot } = build();
        expect(() => new OIMPersistRecordSourceBucketDriven({
            channelMap: new OIMDB(),
            entityCollectionService: entityService,
            entityStoreSlot,
            slotContentBucketService: bucketService.slotContentService,
            bucketSlot,
        })).toThrow(/another OIMDB/);
    });
});

describe('a member that leaves the bucket after its entity was deleted and saved', () => {
    it('is reported while its slot is still alive, so a records resource can hold it', async () => {
        const {
            db, entityService, entityStoreSlot, bucketService, bucketSlot, persistRecordSourceBucketDriven,
        } = build(new OIMDB({ errorPolicy: new OIMErrorPolicyThrowAtOnce() }));
        const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: persistRecordSourceBucketDriven,
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();
        const cardSlot = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c1', deck: 'd', title: 'one' });
        bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, [cardSlot]);
        db.flush();
        await persistor.whenIdle();

        const deletedCardSlot = entityService.findSlotByKey(entityStoreSlot, 'c1');
        if (deletedCardSlot !== undefined) entityService.slotContentService.deleteEntity(deletedCardSlot);
        db.flush();
        await persistor.whenIdle();
        expect(testPersistBackend.entityByKey.has('c1')).toBe(false);

        bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, []);
        expect(() => { db.flush(); }).not.toThrow();
        await persistor.whenIdle();
        expect(oimIsSlotReleased(cardSlot)).toBe(true);

        persistor.destroy();
    });
});

describe('a bucket the source was handed, and a mirror that is torn down', () => {
    it('holds the bucket for as long as it is subscribed, and gives the hold back', () => {
        const { bucketService, bucketStoreSlot, bucketSlot, persistRecordSourceBucketDriven } = build();
        expect(bucketSlot.holdCount).toBe(1);

        const disposer = persistRecordSourceBucketDriven.subscribeEntitySlotChanged(ignoreChange);
        expect(bucketSlot.holdCount).toBe(2);

        disposer();
        expect(bucketSlot.holdCount).toBe(1);
        expect(bucketService.findSlotByKey(bucketStoreSlot, 'inbox')).toBe(bucketSlot);
    });

    it('keeps an empty bucket filed after the caller lets go, while the mirror runs', () => {
        const { bucketService, bucketStoreSlot, bucketSlot, persistRecordSourceBucketDriven } = build();

        const disposer = persistRecordSourceBucketDriven.subscribeEntitySlotChanged(ignoreChange);
        bucketSlot.owner.unholdSlot(bucketSlot);

        expect(bucketService.findSlotByKey(bucketStoreSlot, 'inbox')).toBe(bucketSlot);
        expect(oimIsSlotReleased(bucketSlot)).toBe(false);
        disposer();
    });

    it('leaves the writes that follow reaching the identity the mirror kept', () => {
        const {
            db, entityService, entityStoreSlot, bucketService, bucketStoreSlot, bucketSlot, persistRecordSourceBucketDriven,
        } = build();

        const disposer = persistRecordSourceBucketDriven.subscribeEntitySlotChanged(ignoreChange);
        bucketSlot.owner.unholdSlot(bucketSlot);

        const entitySlot = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c1', deck: 'inbox', title: 'alpha' });
        bucketService.slotContentService.writeBucketMemberSlots(
            bucketService.holdSlotByKey(bucketStoreSlot, 'inbox'), [entitySlot],
        );
        db.flush();

        expect(
            Array.from(bucketService.slotContentService.getBucketMemberSlots(bucketSlot)).map(memberSlot => memberSlot.entity?.title),
        ).toEqual(['alpha']);
        expect(persistRecordSourceBucketDriven.readSnapshot().records.map(record => record.key)).toEqual(['c1']);
        disposer();
    });

    it('takes the hold on the snapshot path too, which is the one a snapshot resource uses', () => {
        const { bucketSlot, persistRecordSourceBucketDriven } = build();

        const disposer = persistRecordSourceBucketDriven.subscribeSnapshotChanged(ignoreChange);
        expect(bucketSlot.holdCount).toBe(2);
        disposer();
        expect(bucketSlot.holdCount).toBe(1);
    });

    it('takes ONE hold however many listeners share the mirror, and gives it back with the last', () => {
        const { bucketSlot, persistRecordSourceBucketDriven } = build();

        const firstDisposer = persistRecordSourceBucketDriven.subscribeEntitySlotChanged(ignoreChange);
        const secondDisposer = persistRecordSourceBucketDriven.subscribeSnapshotChanged(ignoreChange);
        expect(bucketSlot.holdCount).toBe(2);

        firstDisposer();
        expect(bucketSlot.holdCount).toBe(2);
        secondDisposer();
        expect(bucketSlot.holdCount).toBe(1);
    });

    it('refuses a bucket that was already unfiled before the mirror existed', () => {
        const { bucketSlot, persistRecordSourceBucketDriven } = build();
        bucketSlot.owner.unholdSlot(bucketSlot);
        expect(oimIsSlotReleased(bucketSlot)).toBe(true);

        expect(() => persistRecordSourceBucketDriven.subscribeEntitySlotChanged(ignoreChange)).toThrow(/released/);

        expect(oimIsSlotReleased(bucketSlot)).toBe(true);
        expect(bucketSlot.holdCount).toBe(0);
    });
});

describe('the single entity source, which is not in that position', () => {
    it('risks nothing: a written single entity stays filed after its subscription is disposed', () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleEntityService<TSettings>(db);
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, { theme: 'dark' });
        db.flush();
        const persistSnapshotSourceSingleEntityDriven = new OIMPersistSnapshotSourceSingleEntityDriven({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });

        persistSnapshotSourceSingleEntityDriven.subscribeSnapshotChanged(ignoreChange)();
        expect(singleEntitySlot.owner).toBe(singleEntityService.slotContentService.slotOwner);
        expect(singleEntitySlot.holdCount).toBe(0);
        expect(oimIsSlotReleased(singleEntitySlot)).toBe(false);
        expect(singleEntityService.findSingleSlot(singleEntityStoreSlot)).toBe(singleEntitySlot);

        let wakeCount = 0;
        persistSnapshotSourceSingleEntityDriven.subscribeSnapshotChanged(() => { wakeCount++; });
        const wakeCountAtMount = wakeCount;
        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'light' });
        db.flush();

        expect(wakeCount - wakeCountAtMount).toBe(1);
        expect(persistSnapshotSourceSingleEntityDriven.readSnapshot()).toEqual({ theme: 'light' });
    });
});
