import { OIMDB } from '../../db/OIMDB';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMSlotAfterIdleReleasePolicy } from '../../collector/OIMSlotAfterIdleReleasePolicy';
import { mintOIMAfterIdleSlotReleaseWheel } from '../../collector/utils/mintOIMAfterIdleSlotReleaseWheel';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deckId: string };

const KEEP_AFTER_IDLE_MS = 1_000;

function worldWithAReleaseClock() {
    let nowMs = 10_000;
    const db = new OIMDB({ getNowMs: () => nowMs });
    const byDeckService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>(), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }) });
    const byDeck = byDeckService.createStoreSlot(db);
    const sweepTheReleaseClock = (): void => {
        nowMs += KEEP_AFTER_IDLE_MS * 4;
        mintOIMAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
    };
    return { db, byDeckService, byDeck, sweepTheReleaseClock };
}

describe('what holds a mint that wrote nothing', () => {
    it('holdByKey survives the release clock, because the caller holds it', () => {
        const { byDeckService, byDeck, sweepTheReleaseClock } = worldWithAReleaseClock();
        const deck = byDeckService.holdSlotByKey(byDeck, 'd1');

        sweepTheReleaseClock();

        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(deck);
    });

    it('getByKey survives it, because the collector holds the mint', () => {
        const { byDeckService, byDeck, sweepTheReleaseClock } = worldWithAReleaseClock();
        const deck = byDeckService.getSlotByKey(byDeck, 'd1');

        sweepTheReleaseClock();

        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(deck);
    });
});
