import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMEffectService } from '../OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../store/OIMSlotStoreServiceSingleSlotDriven';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TRow = { id: string; n: number };

const DO_NOT_EDIT_TO_MAKE_IT_PASS =
    'DO NOT EDIT TO MAKE IT PASS — it pins who keeps a root an effect never named';

const somethingIsListening = (slot: TOIMSlot): boolean =>
    slot.effects !== undefined && slot.effects.length > 0;

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: (row: TRow) => row.id });
    const rows = rowsService.createStoreSlot(db);
    const byTagService = createOIMBucketService<
        TOIMEntitySlot<TRow>, TOIMStoreKey, TOIMBucketSlotsSetStore<TOIMEntitySlot<TRow>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TRow>>() });
    const byTag = byTagService.createStoreSlot(db);
    const flushUnusedSlots = (): void => OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
    return { db, flushUnusedSlots, effectService, rowsService, rows, byTagService, byTag };
};

const derivationOver = (source: TOIMSlot, db: OIMDB): TOIMComputedSlot<number, void> => {
    let ran = 0;
    const derivationService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const derivationStore = derivationService.createComputedStoreSlot(
        db,
        () => ++ran,
        () => ({ sourceSlots: [source] }),
    );
    return derivationService.computedCollectionService.getSlotByKey(derivationStore, undefined);
};

describe(`a root an effect reaches only through a derivation (${DO_NOT_EDIT_TO_MAKE_IT_PASS})`, () => {
    it('is held by the effect that never named it, which is what the rest of this file rests on', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        rowsService.slotContentService.upsertEntity(rows, { id: 'r1', n: 1 });
        db.flush();
        const slot = rowsService.getSlotByKey(rows, 'r1') as TOIMEntitySlot<TRow, TOIMStoreKey>;

        const effect = effectService.createEffect(db, [], [derivationOver(slot, db)], () => { /* held */ });

        expect(effect.sourceSlots.length).toBe(0);
        expect(effect.allRootSlots.includes(slot)).toBe(true);
        expect(somethingIsListening(slot)).toBe(true);
        expect(slot.holdCount).toBe(2);

        effectService.disposeEffect(effect);
        db.flush();

        expect(slot.holdCount).toBe(0);
    });

    it('survives the give-back of the only hold on it, on an entity slot', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        const slot = rowsService.holdSlotByKey(rows, 'r1');
        const effect = effectService.createEffect(db, [], [derivationOver(slot, db)], () => { /* held */ });

        slot.owner.unholdSlot(slot);

        expect(somethingIsListening(slot)).toBe(true);
        expect(oimIsSlotReleased(slot)).toBe(false);
        expect(rowsService.getSlotByKey(rows, 'r1')).toBe(slot);
        expect(rowsService.getSlotCount(rows)).toBe(1);

        effectService.disposeEffect(effect);
    });

    it('survives it on a bucket slot too', () => {
        const { db, effectService, byTagService, byTag } = createFixture();
        const bucket = byTagService.holdSlotByKey(byTag, 'spades');
        const effect = effectService.createEffect(db, [], [derivationOver(bucket, db)], () => { /* held */ });

        bucket.owner.unholdSlot(bucket);

        expect(somethingIsListening(bucket)).toBe(true);
        expect(oimIsSlotReleased(bucket)).toBe(false);
        expect(byTagService.getSlotCount(byTag)).toBe(1);

        effectService.disposeEffect(effect);
    });

    it('survives the sweep that drops what nothing keeps', () => {
        const { db, flushUnusedSlots, effectService, rowsService, rows } = createFixture();
        const slot = rowsService.holdSlotByKey(rows, 'r1');
        const effect = effectService.createEffect(db, [], [derivationOver(slot, db)], () => { /* held */ });
        slot.owner.unholdSlot(slot);

        db.flush();
        flushUnusedSlots();

        expect(oimIsSlotReleased(slot)).toBe(false);
        expect(rowsService.getSlotByKey(rows, 'r1')).toBe(slot);

        effectService.disposeEffect(effect);
    });

    it('goes once the effect that reached it through the derivation detaches', () => {
        const { db, effectService, rowsService, rows } = createFixture();
        const slot = rowsService.holdSlotByKey(rows, 'r1');
        const effect = effectService.createEffect(db, [], [derivationOver(slot, db)], () => { /* held */ });
        slot.owner.unholdSlot(slot);
        expect(rowsService.getSlotCount(rows)).toBe(1);

        effectService.disposeEffect(effect);
        db.flush();

        expect(somethingIsListening(slot)).toBe(false);
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });
});
