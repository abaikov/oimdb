import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIMReleaseSlotCollectorServiceAfterIdle } from '../OIMReleaseSlotCollectorServiceAfterIdle';
import { OIMSlotReleasePolicyAfterIdle } from '../OIMSlotReleasePolicyAfterIdle';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { oimSliceOfMs } from '../utils/oimSliceOfMs';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

const WHERE_A_32_BIT_SLICE_OVERFLOWS_MS = 2 ** 31 * OIM_SLICE_LENGTH_MS;
const KEEP_AFTER_IDLE_MS = 60_000;

describe('what a release clock answers past 2039', () => {
    it('numbers a slice of a far date upwards, never below zero', () => {
        expect(oimSliceOfMs(WHERE_A_32_BIT_SLICE_OVERFLOWS_MS)).toBe(2 ** 31);
        expect(oimSliceOfMs(WHERE_A_32_BIT_SLICE_OVERFLOWS_MS * 2)).toBeGreaterThan(0);
    });

    it('keeps the slice of a later instant above the slice of an earlier one', () => {
        const earlier = WHERE_A_32_BIT_SLICE_OVERFLOWS_MS - OIM_SLICE_LENGTH_MS;
        const later = WHERE_A_32_BIT_SLICE_OVERFLOWS_MS + OIM_SLICE_LENGTH_MS;
        expect(oimSliceOfMs(later)).toBeGreaterThan(oimSliceOfMs(earlier));
    });

    it('lets a row go on a clock reading past that instant, instead of sweeping it at once', () => {
        let nowMs = WHERE_A_32_BIT_SLICE_OVERFLOWS_MS;
        const db = new OIMDB({ getNowMs: () => nowMs });
        const afterIdleReleaseSlotCollectorSlot = db.collectorSlot.afterIdleReleaseSlotCollectorSlot;
        const cardsService = createOIMEntityService<TCard>(db, {
            keyOf: card => card.id,
            slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }),
        });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });

        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(afterIdleReleaseSlotCollectorSlot);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);

        nowMs += KEEP_AFTER_IDLE_MS * 4;
        db.flush();
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(afterIdleReleaseSlotCollectorSlot);

        expect(oimIsSlotReleased(card)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});
