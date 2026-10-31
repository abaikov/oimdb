import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMChannelSlot } from '../../channel/types/TOIMChannelSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { OIMSlotContentEntityService } from '../OIMSlotContentEntityService';

type TCard = { id: string; title: string };
type TCardsService = ReturnType<typeof createOIMSlotCollectionService<OIMSlotContentEntityService<TCard>>>;

type TCounted = {
    db: OIMDB;
    effectService: OIMEffectService;
    cardsService: TCardsService;
    cards: ReturnType<TCardsService['createStoreSlot']>;
    written: () => number;
};

const restores: (() => void)[] = [];

afterEach(() => {
    while (restores.length !== 0) restores.pop()?.();
});

const createFixture = (): TCounted => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, TOIMStoreKey>() });
    const cards = cardsService.createStoreSlot(db);
    let all = 0;
    const channelService = OIMChannelService.INSTANCE;
    const doors = channelService as unknown as { writeWithoutFlushCheck: (channelSlot: TOIMChannelSlot, slot: TOIMSlot) => void };
    const write = doors.writeWithoutFlushCheck;
    doors.writeWithoutFlushCheck = (channelSlot: TOIMChannelSlot, slot: TOIMSlot): void => {
        all++;
        write.call(channelService, channelSlot, slot);
    };
    restores.push(() => { doors.writeWithoutFlushCheck = write; });
    return {
        db,
        effectService,
        cards,
        cardsService,
        written: () => all,
    };
};

const hundred = (title: string): TCard[] => {
    const rows: TCard[] = [];
    for (let i = 0; i < 100; i++) rows.push({ id: `c${i}`, title });
    return rows;
};

describe('what a batch of writes tells the channel', () => {
    it('names each row of a batch of inserts once, and nothing else', () => {
        const fixture = createFixture();

        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('A')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
    });

    it('names each row of a batch filed by insertMany once, and nothing else', () => {
        const fixture = createFixture();

        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('A')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
    });

    it('names each row of a batch of overwrites once, and nothing else', () => {
        const fixture = createFixture();
        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('A')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();
        const before = fixture.written();

        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('B')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(fixture.written() - before).toBe(100);
    });

    it('names nothing at all for a batch that changed no value', () => {
        const fixture = createFixture();
        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('A')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();
        const before = fixture.written();

        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('A')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(fixture.written() - before).toBe(0);
    });

    it('wakes an effect over one row of the batch exactly once', () => {
        const fixture = createFixture();
        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('A')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c7');
        let runCount = 0;
        fixture.effectService.createEffect(fixture.db, () => { runCount++; }, [slot]);
        fixture.db.flush();
        runCount = 0;

        fixture.cardsService.writeInBatch(fixture.cards, () => (hundred('B')).map(entity => fixture.cardsService.writeSlotContentByKey(fixture.cards, entity.id, entity)));
        fixture.db.flush();

        expect(runCount).toBe(1);
        expect(slot.entity?.title).toBe('B');
    });
});
