import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMDB } from '../../db/OIMDB';
import type { IOIMSlotStamp } from '../../slot/interfaces/IOIMSlotStamp';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { oimIsSlotEmpty } from '../../slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
type TCard = { id: string; title?: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const plantTheKey = {
    stamp(slot: { entity: TCard | undefined; readonly key: TOIMStoreKey }): void {
        slot.entity ??= { id: String(slot.key) };
    },
};

const onlyTheKeyIsLeft = {
    isEmpty: (slot: TCardSlot): boolean =>
        slot.entity === undefined || slot.entity.title === undefined,
};

const createFixture = () => {
    const defaults = new OIMDefaults({ slotStamp: plantTheKey as unknown as IOIMSlotStamp<TOIMSlot> });
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMSlotContentEntityService<TCard, TOIMStoreKey>({ defaults, slotEmptinessPolicy: onlyTheKeyIsLeft }) });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

describe('a seed that is not empty, and an emptiness that knows why', () => {
    it('mints the key into the row, and still calls it empty', () => {
        const { cardsService, cards } = createFixture();

        const card = cardsService.getSlotByKey(cards, 'c1');

        expect(card.entity).toEqual({ id: 'c1' });
        expect(oimIsSlotEmpty(card)).toBe(true);
    });

    it('answers a read without a maybe, because the seed says there is always a row', () => {
        const { cardsService, cards } = createFixture();
        cardsService.getSlotByKey(cards, 'c1');

        const read = cardsService.findSlotByKey(cards, 'c1')?.entity;

        expect(read).toEqual({ id: 'c1' });
    });

    it('answers the first read of a key nobody wrote with the seed, having been asked nothing else', () => {
        const { cardsService, cards } = createFixture();

        const read = cardsService.getSlotByKey(cards, 'c1').entity;

        expect(read).toEqual({ id: 'c1' });
    });

    it('answers every read of that key with the one row it filed, not a fresh seed each time', () => {
        const { cardsService, cards } = createFixture();

        const first = cardsService.getSlotByKey(cards, 'c1').entity;
        const second = cardsService.getSlotByKey(cards, 'c1').entity;

        expect(second).toBe(first);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('seeds nothing on a find, which files no identity', () => {
        const { cardsService, cards } = createFixture();

        expect(cardsService.findSlotByKey(cards, 'c1')?.entity).toBeUndefined();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('sweeps a row that carries nothing but its key', () => {
        const { db, cardsService, cards } = createFixture();
        const card = cardsService.getSlotByKey(cards, 'c1');

        db.flush();

        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(oimIsSlotReleased(card)).toBe(true);
    });

    it('keeps a row the moment a value lands beside the key', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.getSlotByKey(cards, 'c1');
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });

        db.flush();

        const card = cardsService.getSlotByKey(cards, 'c1');
        expect(oimIsSlotEmpty(card)).toBe(false);
        expect(card.entity).toEqual({ id: 'c1', title: 'one' });
    });

    it('puts the seed back on remove, rather than nothing', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const held = cardsService.holdSlotByKey(cards, 'c1');

        cardsService.slotContentService.clearSlotContent(held);

        expect(held.entity).toEqual({ id: 'c1' });
        expect(oimIsSlotEmpty(held)).toBe(true);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(held);
        held.owner.unholdSlot(held);
    });

    it('lets the row go once the hold that survived the remove is given back', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const held = cardsService.holdSlotByKey(cards, 'c1');
        cardsService.slotContentService.clearSlotContent(held);

        held.owner.unholdSlot(held);

        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(oimIsSlotReleased(held)).toBe(true);
    });
});
