import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMReleaseSlotCollectorServiceAfterIdle } from '../../collector/OIMReleaseSlotCollectorServiceAfterIdle';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotReleasePolicyAfterIdle } from '../../collector/OIMSlotReleasePolicyAfterIdle';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string };

const KEEP_AFTER_IDLE_MS = 1_000;

function worldWithAReleaseClock() {
    let nowMs = 10_000;
    const db = new OIMDB({ getNowMs: () => nowMs });
    const byDeckService = createOIMBucketService<
        TOIMEntitySlot<TCard>, string, TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>,
        OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>
    >(db, {
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }),
    });
    const byDeck = byDeckService.createStoreSlot(db);
    const sweepTheReleaseClock = (): void => {
        nowMs += KEEP_AFTER_IDLE_MS * 4;
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
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
