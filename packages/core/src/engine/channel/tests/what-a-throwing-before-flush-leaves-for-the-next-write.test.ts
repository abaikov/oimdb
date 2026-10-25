import { OIMDB, OIMEffectService, OIMThrowAtOnceErrorPolicy } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; n: number };

describe('what a throwing onBeforeFlush leaves for the next write', () => {
    it('lets the next write ask the scheduler for a frame again, under a policy that throws at once', () => {
        const hostQueue: (() => void)[] = [];
        let fail = false;
        const db = new OIMDB({
            channelScheduler: run => { hostQueue.push(run); },
            errorPolicy: new OIMThrowAtOnceErrorPolicy(),
            onBeforeFlush: () => { if (fail) throw new Error('before'); },
        });
        const effectService = OIMEffectService.INSTANCE;
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 's', { id: 's', n: 0 });
        const seen: number[] = [];
        effectService.createEffect(db, [card], [], () => { seen.push(card.entity?.n ?? -1); });
        while (hostQueue.length > 0) hostQueue.shift()!();
        seen.length = 0;

        fail = true;
        cardsService.slotContentService.updateEntity(card, { n: 1 });
        expect(() => { while (hostQueue.length > 0) hostQueue.shift()!(); }).toThrow('before');
        fail = false;
        cardsService.slotContentService.updateEntity(card, { n: 2 });

        expect(hostQueue).toHaveLength(1);
        hostQueue.shift()!();
        expect(seen).toEqual([2]);
    });
});
