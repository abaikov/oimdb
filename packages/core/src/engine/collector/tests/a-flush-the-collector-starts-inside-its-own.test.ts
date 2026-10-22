import {
    OIMChannelService, OIMDB, OIMEffectService, OIMSlotReleasePolicyAfterWrite, createOIMEntityService,
    oimIsSlotReleased,
} from '../../../index';

type TCard = { id: string };

const createFixture = () => {
    const db = new OIMDB({
        channelScheduler: run => { run(); },
        getNowMs: () => 0,
        releaseTimer: () => () => undefined,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: 0 }),
    });
    OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => undefined);
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a flush the unused-slot collector starts inside its own', () => {
    it('does not give the same hold back twice when a release writes and a scheduler that runs at once flushes again', () => {
        const { cardsService, cards } = createFixture();

        expect(() => cardsService.slotContentService.upsertEntity(cards, { id: 'y' })).not.toThrow();
    });

    it('leaves a subscribed slot with the hold its subscription took', () => {
        const { db, cardsService, cards } = createFixture();
        const watched = cardsService.holdSlotByKey(cards, 'w');
        cardsService.slotContentService.upsertEntity(cards, { id: 'w' });
        OIMEffectService.INSTANCE.createEffect(db, [watched], [], () => undefined);
        const holdsOfTheSubscription = watched.holdCount;

        cardsService.slotContentService.upsertEntity(cards, { id: 'y' });

        expect(oimIsSlotReleased(watched)).toBe(false);
        expect(watched.holdCount).toBe(holdsOfTheSubscription);
    });
});
