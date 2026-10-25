import { OIMChannelService, OIMDB, OIMEffectService, OIMSlotAfterWriteReleasePolicy, oimIsSlotReleased } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string };

const createFixture = () => {
    const db = new OIMDB({
        channelScheduler: run => { run(); },
        getNowMs: () => 0,
        releaseTimer: () => () => undefined,
        slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 0 }),
    });
    OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => undefined);
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a flush the unused-slot collector starts inside its own', () => {
    it('does not give the same hold back twice when a release writes and a scheduler that runs at once flushes again', () => {
        const { cardsService, cards } = createFixture();

        expect(() => cardsService.writeSlotContentByKey(cards, 'y', { id: 'y' })).not.toThrow();
    });

    it('leaves a subscribed slot with the hold its subscription took', () => {
        const { db, cardsService, cards } = createFixture();
        const watched = cardsService.holdSlotByKey(cards, 'w');
        cardsService.writeSlotContentByKey(cards, 'w', { id: 'w' });
        OIMEffectService.INSTANCE.createEffect(db, [watched], [], () => undefined);
        const holdsOfTheSubscription = watched.holdCount;

        cardsService.writeSlotContentByKey(cards, 'y', { id: 'y' });

        expect(oimIsSlotReleased(watched)).toBe(false);
        expect(watched.holdCount).toBe(holdsOfTheSubscription);
    });
});
