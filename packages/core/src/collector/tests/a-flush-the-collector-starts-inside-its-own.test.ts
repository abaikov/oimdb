import { OIMDefaults } from '../../index';
import { OIMChannelService, OIMDB, OIMEffectService, OIMSlotAfterWriteReleasePolicy, isOIMSlotReleased } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string };

const createFixture = () => {
    const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs: 0 }) });
    const db = new OIMDB({ channelScheduler: run => { run(); }, getNowMs: () => 0, releaseTimer: () => () => undefined });
    OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => undefined);
    const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard, string>({ defaults }) });
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
        OIMEffectService.INSTANCE.createEffect(db, () => undefined, [watched]);
        const holdsOfTheSubscription = watched.holdCount;

        cardsService.writeSlotContentByKey(cards, 'y', { id: 'y' });

        expect(isOIMSlotReleased(watched)).toBe(false);
        expect(watched.holdCount).toBe(holdsOfTheSubscription);
    });
});
