import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMChannelSlot } from '../../../engine/channel/types/TOIMChannelSlot';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardsService = ReturnType<typeof createOIMEntityService<TCard>>;

type TCounted = {
    db: OIMDB;
    effectService: OIMEffectService;
    cardsService: TCardsService;
    cards: ReturnType<TCardsService['createStoreSlot']>;
    written: () => number;
    reset: () => void;
    deleteEntitiesByKeys: (keys: readonly TOIMStoreKey[]) => void;
    deleteEntities: (slots: readonly TCardSlot[]) => void;
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
        cardsService,
        cards,
        written: () => all,
        reset: () => { all = 0; },
        deleteEntitiesByKeys: (keys) => {
            const slots: TCardSlot[] = [];
            for (const key of keys) {
                const slot = cardsService.findSlotByKey(cards, key);
                if (slot !== undefined) slots.push(slot);
            }
            cardsService.slotContentService.deleteEntities(cards, slots);
        },
        deleteEntities: (slots) => {
            cardsService.slotContentService.deleteEntities(cards, slots);
        },
    };
};

const hundred = (title: string): TCard[] => {
    const rows: TCard[] = [];
    for (let i = 0; i < 100; i++) rows.push({ id: `c${i}`, title });
    return rows;
};

const keysOfHundred = (): TOIMStoreKey[] => {
    const keys: TOIMStoreKey[] = [];
    for (let i = 0; i < 100; i++) keys.push(`c${i}`);
    return keys;
};

const filled = (): TCounted => {
    const fixture = createFixture();
    fixture.cardsService.slotContentService.upsertEntities(fixture.cards, hundred('A'));
    fixture.db.flush();
    fixture.reset();
    return fixture;
};

describe('what a batch of removals tells the channel', () => {
    it('names each row of a batch removed by key once, nothing else, and releases every one', () => {
        const fixture = filled();

        fixture.deleteEntitiesByKeys(keysOfHundred());
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('names each row of a batch removed by slot once, nothing else, and releases every one', () => {
        const fixture = filled();
        const slots: TCardSlot[] = keysOfHundred().map(key => fixture.cardsService.getSlotByKey(fixture.cards, key));
        fixture.reset();

        fixture.deleteEntities(slots);
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
        expect(slots.every(slot => oimIsSlotReleased(slot))).toBe(true);
    });
    it('names each held row of a batch removed by key once, and nothing else', () => {
        const fixture = filled();
        const heldSlots: TCardSlot[] = keysOfHundred().map(key => fixture.cardsService.holdSlotByKey(fixture.cards, key));
        fixture.reset();

        fixture.deleteEntitiesByKeys(keysOfHundred());
        fixture.db.flush();

        expect(fixture.written()).toBe(100);
        for (const heldSlot of heldSlots) heldSlot.owner.unholdSlot(heldSlot);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('names nothing at all for a batch of keys it does not have', () => {
        const fixture = filled();

        fixture.deleteEntitiesByKeys(['nope0', 'nope1', 'nope2']);
        fixture.db.flush();

        expect(fixture.written()).toBe(0);
    });

    it('wakes an effect over one row of the batch exactly once', () => {
        const fixture = filled();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c7');
        let runCount = 0;
        fixture.effectService.createEffect(fixture.db, [slot], [], () => { runCount++; });
        fixture.db.flush();
        runCount = 0;

        fixture.deleteEntitiesByKeys(keysOfHundred());
        fixture.db.flush();

        expect(runCount).toBe(1);
    });

    it('takes the entity of every row the batch named', () => {
        const fixture = filled();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c7');

        fixture.deleteEntitiesByKeys(keysOfHundred());
        fixture.db.flush();

        expect(slot.entity).toBeUndefined();
        expect(fixture.cardsService.slotContentService.findEntityByKey(fixture.cards, 'c7')).toBeUndefined();
    });
});
