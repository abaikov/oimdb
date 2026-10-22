import {
    OIMDB,
    OIMEffectService,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMSlotReleasePolicyAfterIdle,
    OIMUnusedSlotCollectorService,
    createOIMEntityService,
    oimIsSlotReleased,
} from '../../../index';
import type { TOIMDisposer } from '../../../index';

type TCard = { id: string; title: string };

const START = 1_000_000;

const createFixtureAt = (after: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: (_run): TOIMDisposer => (): void => undefined });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: after }),
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, at: (value: number): void => { ms = value; } };
};

const flushAfterIdle = (db: OIMDB): void => {
    OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
};

describe('a sweep that meets a slot somebody watches by column', () => {
    it('leaves the identity where it is', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        let heard = 0;
        const watching = OIMEffectService.INSTANCE.createEffect(fixture.db, [fixture.cardsService.getColumn(slot, 'title')], [], () => { heard++; });

        fixture.at(START + 31_000);
        flushAfterIdle(fixture.db);

        // THE IDENTITY AND NOT A COPY OF IT: the watcher's column slot hangs off
        // this object, so anything else here means a second identity under the
        // same key and a subscriber nothing will write to again.
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);

        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'two' });
        fixture.db.flush();
        expect(heard).toBe(1);

        OIMEffectService.INSTANCE.disposeEffect(watching);
    });

    it('and takes it the moment that watcher goes, because it is still condemned', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        const watching = OIMEffectService.INSTANCE.createEffect(fixture.db, [fixture.cardsService.getColumn(slot, 'title')], [], () => undefined);

        fixture.at(START + 31_000);
        flushAfterIdle(fixture.db);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);

        // The window is not waived, only the term that was never about content:
        // the mark is on the slot, so the give-back finishes the release with no
        // second sweep. The column the subscription minted is the collector's.
        OIMEffectService.INSTANCE.disposeEffect(watching);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);
        OIMUnusedSlotCollectorService.INSTANCE.flush(fixture.db.collectorSlot.unusedSlotCollectorSlot);
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});
