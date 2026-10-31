import { OIMDefaults } from '../../index';
import { OIMDB, OIMEffectService, OIMThrowAtOnceErrorPolicy, OIMSlotAfterWriteReleasePolicy, oimIsSlotReleased } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; n: number };

describe('a release asked for inside a frame', () => {
    it('waits for the flush to end instead of refusing the frame, when an effect body disposes another effect', () => {
        let nowMs = 0;
        const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 100 }) });
        const db = new OIMDB({ errorPolicy: new OIMThrowAtOnceErrorPolicy(), getNowMs: () => nowMs, releaseTimer: () => () => undefined });
        const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard, string>({ defaults }) });
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
