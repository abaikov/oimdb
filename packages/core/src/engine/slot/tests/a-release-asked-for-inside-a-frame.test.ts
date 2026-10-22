import {
    OIMDB, OIMEffectService, OIMErrorPolicyThrowAtOnce, OIMSlotReleasePolicyAfterWrite,
    createOIMEntityService, oimIsSlotReleased,
} from '../../../index';

type TCard = { id: string; n: number };

describe('a release asked for inside a frame', () => {
    it('waits for the flush to end instead of refusing the frame, when an effect body disposes another effect', () => {
        let nowMs = 0;
        const db = new OIMDB({
            errorPolicy: new OIMErrorPolicyThrowAtOnce(),
            getNowMs: () => nowMs,
            releaseTimer: () => () => undefined,
            slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 100 }),
        });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const a = cardsService.slotContentService.upsertEntity(cards, { id: 'a', n: 0 });
        const effectOnA = OIMEffectService.INSTANCE.createEffect(db, [a], [], () => undefined);
        const b = cardsService.holdSlotByKey(cards, 'b');
        OIMEffectService.INSTANCE.createEffect(db, [b], [], () => { OIMEffectService.INSTANCE.disposeEffect(effectOnA); });
        db.flush();
        nowMs = 200;
        cardsService.slotContentService.upsertEntity(cards, { id: 'b', n: 1 });

        expect(() => { db.flush(); }).not.toThrow();
        expect(a.holdCount).toBe(0);
        expect(oimIsSlotReleased(a)).toBe(true);
    });
});
