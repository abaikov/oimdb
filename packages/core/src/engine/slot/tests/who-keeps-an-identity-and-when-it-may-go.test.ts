import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';

type TRow = { id: string; n: number };

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row: TRow) => row.id });
    const rows = rowsService.createStoreSlot(db);
    return { db, rowsService, rows };
};

type TFixture = ReturnType<typeof createFixture>;

/**
 * A key whose value has not arrived — minted through the hold door, AND THE HOLD
 * HANDED TO THE CALLER rather than given back here.
 *
 * GIVING IT BACK ON THE NEXT LINE UNFILES THE SLOT. `OIMSlotOwner.unholdSlot`
 * ASKS `releaseSlotIfUnheld` after decrementing — otherwise a caller who takes a hold and
 * gives it back leaves an identity filed with no value, no listener and no
 * bucket for the life of the collection. A helper that released here would
 * be dropping the last reference, and `rows.slots.size` would read 0 where the
 * cases below expect 1.
 *
 * The held slot goes to the case because the case is what decides when the hold
 * stops being the thing that keeps the identity: after an effect is attached,
 * after the slot is put in a bucket, or after a value has arrived. Every one of those
 * lines is the subject of the case it is in.
 */
const reserve = (
    rowsService: TFixture['rowsService'], rows: TFixture['rows'], key: string,
): TOIMEntitySlot<TRow, TOIMStoreKey> => rowsService.holdSlotByKey(rows, key);

describe('who keeps an identity, and when it may go', () => {
    it('holding the same key twice hands back the same object', () => {
        const { rowsService, rows } = createFixture();

        const firstSlot = rowsService.holdSlotByKey(rows, 'r1');

        const secondSlot = rowsService.holdSlotByKey(rows, 'r1');
        expect(secondSlot).toBe(firstSlot);
        firstSlot.owner.unholdSlot(firstSlot);
        secondSlot.owner.unholdSlot(secondSlot);
    });

    it('identity is stable across an upsert — the load-bearing guarantee of the engine', () => {
        const { db, rowsService, rows } = createFixture();

        const first = reserve(rowsService, rows, 'r1');
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        db.flush();
        // The value is what keeps it from here, so the reservation can go — and
        // that is the guarantee: the identity outlives the hold that reserved it.
        first.owner.unholdSlot(first);
        const afterWrite = rowsService.getSlotByKey(rows, 'r1');

        expect(afterWrite).toBe(first);
        expect(afterWrite?.entity?.n).toBe(1);
    });

    it('a read files an identity the collector takes back, and a hold keeps one', () => {
        const { db, rowsService, rows } = createFixture();

        const asked = rowsService.getSlotByKey(rows, 'ghost');
        expect(asked.entity).toBeUndefined();
        expect(rowsService.getSlotCount(rows)).toBe(1);

        db.flush();
        expect(oimIsSlotReleased(asked)).toBe(true);
        expect(rowsService.getSlotCount(rows)).toBe(0);

        const reserved = reserve(rowsService, rows, 'ghost');

        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'ghost')).toBe(reserved);
        expect(oimIsSlotEmpty(reserved)).toBe(true);

        reserved.owner.unholdSlot(reserved);
        // And the give-back is the other half of the same sentence: the hold was
        // the whole of what kept it, so handing it back takes the identity with it.
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('a reserved identity with no value and no bucket is let go of when the last effect goes', () => {
        const { db, rowsService, rows } = createFixture();

        const reserved = reserve(rowsService, rows, 'ghost');
        const effect = OIMEffectService.INSTANCE.createEffect(db, [reserved], [], () => { /* nothing */ });
        // The effect is attached, so it is now the last reference and the
        // reservation can go. Without this the dispose below would leave a hold
        // standing and the case would be asking a different question.
        reserved.owner.unholdSlot(reserved);
        expect(rowsService.getSlotCount(rows)).toBe(1);

        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect(oimIsSlotReleased(reserved)).toBe(true);
    });

    it('an identity another effect still reads is not let go of when one of them goes', () => {
        const { db, rowsService, rows } = createFixture();

        const slot = reserve(rowsService, rows, 'ghost');
        const first = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* nothing */ });
        OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* nothing */ });
        // Both effects are attached, so what keeps the identity below is the
        // SECOND EFFECT and nothing else — which is the whole of the case.
        slot.owner.unholdSlot(slot);

        OIMEffectService.INSTANCE.disposeEffect(first);

        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'ghost')).toBe(slot);
    });

    it('an identity a hold still keeps is not let go of when its last effect goes', () => {
        const { db, rowsService, rows } = createFixture();

        const heldSlot = rowsService.holdSlotByKey(rows, 'ghost');

        const effect = OIMEffectService.INSTANCE.createEffect(db, [heldSlot], [], () => { /* nothing */ });

        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'ghost')).toBe(heldSlot);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('an identity a bucket still holds is not let go of after its last effect goes', () => {
        const { db, rowsService, rows } = createFixture();
        // The store and the bucket service are this bucket collection's own, so
        // they are constructed here beside it: those two are what it IS.
        const searchService = createOIMBucketService<
            TOIMEntitySlot<TRow>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow>>,
            OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>() });
        const search = searchService.createStoreSlot(db);

        // A slot with no value at all, joined into a manual bucket by hand.
        const slot = reserve(rowsService, rows, 'ghost');
        const bucketSlot = searchService.holdSlotByKey(search, 'q');
        searchService.slotContentService.writeBucketMemberSlots(bucketSlot, [slot]);
        // Both reservations go once the bucket holds the slot, so the count
        // asserted below is the BUCKET's one hold and not this fixture's.
        slot.owner.unholdSlot(slot);
        bucketSlot.owner.unholdSlot(bucketSlot);
        // A SLOT IN A BUCKET TAKES A HOLD: there is ONE count of "something
        // records a reference to this identity", and a bucket is one of the
        // things in it.
        expect(slot.holdCount).toBe(1);

        const effect = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* nothing */ });
        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'ghost')).toBe(slot);
    });

    it('an identity that carries a value is not let go of after its last effect goes', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        db.flush();

        const slot = rowsService.getSlotByKey(rows, 'r1')!;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [slot], [], () => { /* nothing */ });
        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(rowsService.getSlotCount(rows)).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'r1')).toBe(slot);
    });

    it('after release, holding the same key again mints a fresh identity', () => {
        const { db, rowsService, rows } = createFixture();

        const original = reserve(rowsService, rows, 'ghost');
        const effect = OIMEffectService.INSTANCE.createEffect(db, [original], [], () => { /* nothing */ });
        // The effect is the last reference from here, so the dispose below is what
        // releases the identity — which is what makes the next hold a FRESH one.
        original.owner.unholdSlot(original);
        OIMEffectService.INSTANCE.disposeEffect(effect); // released

        const freshSlot = rowsService.holdSlotByKey(rows, 'ghost');

        expect(freshSlot).not.toBe(original);
        expect(rowsService.getSlotByKey(rows, 'ghost')).toBe(freshSlot);
        freshSlot.owner.unholdSlot(freshSlot);
    });
});
