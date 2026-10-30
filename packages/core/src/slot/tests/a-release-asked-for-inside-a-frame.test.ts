import { OIMDB, OIMEffectService, OIMThrowAtOnceErrorPolicy, OIMSlotAfterWriteReleasePolicy, oimIsSlotReleased } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; n: number };

describe('a release asked for inside a frame', () => {
    it('waits for the flush to end instead of refusing the frame, when an effect body disposes another effect', () => {
        let nowMs = 0;
        const db = new OIMDB({
            errorPolicy: new OIMThrowAtOnceErrorPolicy(),
            getNowMs: () => nowMs,
            releaseTimer: () => () => undefined,
            slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 100 }),
        });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const a = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', n: 0 });
        const effectOnA = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [a]);
        const b = cardsService.holdSlotByKey(cards, 'b');
        OIMEffectService.INSTANCE.createEffect(db, () => { OIMEffectService.INSTANCE.disposeEffect(effectOnA); }, [b]);
        db.flush();
        nowMs = 200;
        cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', n: 1 });

        expect(() => { db.flush(); }).not.toThrow();
        expect(a.holdCount).toBe(0);
        expect(oimIsSlotReleased(a)).toBe(true);
    });
});
