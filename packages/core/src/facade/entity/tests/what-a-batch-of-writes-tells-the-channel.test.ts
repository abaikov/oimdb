import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMChannelSlot } from '../../../engine/channel/types/TOIMChannelSlot';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';

type TCard = { id: string; title: string };
type TCardsService = ReturnType<typeof createOIMEntityService<TCard>>;

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
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: card => card.id });
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

        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('A'));
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
    });

    it('names each row of a batch filed by insertMany once, and nothing else', () => {
        const fixture = createFixture();

        fixture.cardsService.slotContentService.insertEntities(fixture.cards,hundred('A'));
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
    });

    it('names each row of a batch of overwrites once, and nothing else', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('A'));
        fixture.db.flush();
        const before = fixture.written();

        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('B'));
        fixture.db.flush();

        expect(fixture.written() - before).toBe(100);
    });

    it('names nothing at all for a batch that changed no value', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('A'));
        fixture.db.flush();
        const before = fixture.written();

        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('A'));
        fixture.db.flush();

        expect(fixture.written() - before).toBe(0);
    });

    it('wakes an effect over one row of the batch exactly once', () => {
        const fixture = createFixture();
        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('A'));
        fixture.db.flush();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c7');
        let runCount = 0;
        fixture.effectService.createEffect(fixture.db, [slot], [], () => { runCount++; });
        fixture.db.flush();
        runCount = 0;

        fixture.cardsService.slotContentService.upsertEntities(fixture.cards,hundred('B'));
        fixture.db.flush();

        expect(runCount).toBe(1);
        expect(slot.entity?.title).toBe('B');
    });
});
