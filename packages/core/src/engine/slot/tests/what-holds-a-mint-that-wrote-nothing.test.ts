import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotContentSetBucketService } from '../../../facade/bucket/OIMSlotContentSetBucketService';
import { OIMSlotAfterIdleReleasePolicy } from '../../collector/OIMSlotAfterIdleReleasePolicy';
import { oimMintAfterIdleSlotReleaseWheel } from '../../collector/utils/oimMintAfterIdleSlotReleaseWheel';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; deckId: string };

const KEEP_AFTER_IDLE_MS = 1_000;

function worldWithAReleaseClock() {
    let nowMs = 10_000;
    const db = new OIMDB({ getNowMs: () => nowMs });
    const byDeckService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }) });
    const byDeck = byDeckService.createStoreSlot(db);
    const sweepTheReleaseClock = (): void => {
        nowMs += KEEP_AFTER_IDLE_MS * 4;
        oimMintAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
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
