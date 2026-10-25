import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIMSlotAfterIdleReleasePolicy } from '../OIMSlotAfterIdleReleasePolicy';
import { OIMDB } from '../../../factories/OIMDB';
import { oimSliceOfMs } from '../utils/oimSliceOfMs';
import { oimMintAfterIdleSlotReleaseWheel } from '../utils/oimMintAfterIdleSlotReleaseWheel';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

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
        const afterIdleSlotReleaseWheel = oimMintAfterIdleSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });

        afterIdleSlotReleaseWheel.flush();
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);

        nowMs += KEEP_AFTER_IDLE_MS * 4;
        db.flush();
        afterIdleSlotReleaseWheel.flush();

        expect(oimIsSlotReleased(card)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });
});
