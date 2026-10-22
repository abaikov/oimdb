import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMSlotReleasePolicyAfterIdle } from '../../collector/OIMSlotReleasePolicyAfterIdle';
import { OIMSlotReleasePolicyAfterWrite } from '../../collector/OIMSlotReleasePolicyAfterWrite';
import { OIMSlotReleasePolicyEarliest } from '../../collector/OIMSlotReleasePolicyEarliest';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

const KEEP_AFTER_WRITE_MS = 60_000;
const KEEP_AFTER_IDLE_MS = 90_000;

function worldWhereTheTwoClocksDisagree() {
    let afterWriteNowMs = 1_000;
    const afterIdleNowMs = 500_000_000;
    const db = new OIMDB({ getNowMs: () => afterWriteNowMs });
    Object.assign(db.collectorSlot.afterIdleReleaseSlotCollectorSlot, { getNowMs: () => afterIdleNowMs });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyEarliest([
            new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: KEEP_AFTER_WRITE_MS }),
            new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }),
        ]),
    });
    const cards = cardsService.createStoreSlot(db);
    return {
        db, cards, cardsService,
        advanceAfterWriteClockBy: (ms: number) => { afterWriteNowMs += ms; },
    };
}

describe('each release deadline is measured against its own clock', () => {
    it('a row written a moment ago is kept, however far the OTHER collector\'s clock reads', () => {
        const { db, cards, cardsService, advanceAfterWriteClockBy } = worldWhereTheTwoClocksDisagree();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const card = cardsService.getSlotByKey(cards, 'c1')!;

        card.owner.releaseSlotIfUnheld(card);
        expect(oimIsSlotReleased(card)).toBe(false);

        advanceAfterWriteClockBy(KEEP_AFTER_WRITE_MS - 1);
        card.owner.releaseSlotIfUnheld(card);
        expect(oimIsSlotReleased(card)).toBe(false);
    });

    it('and it is let go once ITS OWN clock reaches the deadline, not before', () => {
        const { db, cards, cardsService, advanceAfterWriteClockBy } = worldWhereTheTwoClocksDisagree();
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const card = cardsService.getSlotByKey(cards, 'c1')!;

        advanceAfterWriteClockBy(KEEP_AFTER_WRITE_MS);
        card.owner.releaseSlotIfUnheld(card);

        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('one collector alone still answers from its own clock', () => {
        let nowMs = 1_000;
        const db = new OIMDB({ getNowMs: () => nowMs });
        const cardsService = createOIMEntityService<TCard>(db, {
            keyOf: card => card.id,
            slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: KEEP_AFTER_WRITE_MS }),
        });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        const card = cardsService.getSlotByKey(cards, 'c1')!;

        card.owner.releaseSlotIfUnheld(card);
        expect(oimIsSlotReleased(card)).toBe(false);
        nowMs += KEEP_AFTER_WRITE_MS;
        card.owner.releaseSlotIfUnheld(card);
        expect(oimIsSlotReleased(card)).toBe(true);
    });
});
