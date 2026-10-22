import {
    OIMDB, createOIMBucketService, createOIMEntityService, createOIMIndexService,
    oimIsSlotEmpty, oimIsSlotReleased,
} from '../src/index';
import type { TOIMSlot } from '../src/index';
import type { OIMChannelQueue } from '../src/engine/channel/OIMChannelQueue';
import type { TOIMChannelSlot } from '../src/engine/channel/types/TOIMChannelSlot';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import { OIMChannelService } from '../src/engine/channel/OIMChannelService';
import { OIMContentChangeListenerService } from '../src/engine/slot/OIMContentChangeListenerService';
import { OIMSlotContentBucketServiceSetDriven } from '../src/facade/bucket/OIMSlotContentBucketServiceSetDriven';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

type TPhase = 'during' | 'atClose' | 'outside';

type TSubframeLog = {
    depth: number;
    isClosingOutermost: boolean;
    isDoorRunning: boolean;
};

type TSighting = { slot: TOIMSlot; phase: TPhase; isDoorRunning: boolean; isEmpty: boolean };

const phaseOf = (log: TSubframeLog): TPhase => {
    if (log.isClosingOutermost) return 'atClose';
    return log.depth > 0 ? 'during' : 'outside';
};

const watchChannel = (db: OIMDB, writes: TSighting[]): TSubframeLog => {
    const log: TSubframeLog = { depth: 0, isClosingOutermost: false, isDoorRunning: false };
    const channelService = OIMChannelService.INSTANCE;
    const openSubframe = channelService.openSubframe.bind(channelService);
    const closeSubframe = channelService.closeSubframe.bind(channelService);
    const write = channelService.writeWithoutFlushCheck.bind(channelService);
    jest.spyOn(channelService, 'openSubframe').mockImplementation((channelSlot: TOIMChannelSlot): void => {
        if (channelSlot === db.defaultChannelSlot) log.depth++;
        openSubframe(channelSlot);
    });
    jest.spyOn(channelService, 'closeSubframe').mockImplementation((channelSlot: TOIMChannelSlot): void => {
        if (channelSlot !== db.defaultChannelSlot) {
            closeSubframe(channelSlot);
            return;
        }
        const isOutermost = log.depth === 1;
        if (isOutermost) log.isClosingOutermost = true;
        try {
            closeSubframe(channelSlot);
        } finally {
            log.depth--;
            if (isOutermost) log.isClosingOutermost = false;
        }
    });
    jest.spyOn(channelService, 'writeWithoutFlushCheck').mockImplementation((channelSlot: TOIMChannelSlot, slot: TOIMSlot): void => {
        writes.push({ slot, phase: phaseOf(log), isDoorRunning: log.isDoorRunning, isEmpty: oimIsSlotEmpty(slot) });
        write(channelSlot, slot);
    });
    return log;
};

const createContentChangeListener = (log: TSubframeLog, announcements: TSighting[]) => ({
    onContentChanged: (slot: TOIMSlot): void => {
        announcements.push({ slot, phase: phaseOf(log), isDoorRunning: log.isDoorRunning, isEmpty: oimIsSlotEmpty(slot) });
    },
    onContentChangedMany: (slotChannelQueue: OIMChannelQueue<TOIMSlot>): void => {
        for (let i = 0; i < slotChannelQueue.getEntryCount(); i++) {
            const slot = slotChannelQueue.getEntryAt(i);
            announcements.push({ slot, phase: phaseOf(log), isDoorRunning: log.isDoorRunning, isEmpty: oimIsSlotEmpty(slot) });
        }
    },
});

const sightingsOf = (sightings: readonly TSighting[], slot: TOIMSlot, phase?: TPhase): TSighting[] =>
    sightings.filter(sighting => sighting.slot === slot && (phase === undefined || sighting.phase === phase));

const runDoor = (log: TSubframeLog, door: () => void): void => {
    log.isDoorRunning = true;
    try {
        door();
    } finally {
        log.isDoorRunning = false;
    }
};

const openSubframe = (db: OIMDB): void => { OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot); };
const closeSubframe = (db: OIMDB): void => { OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot); };

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
    const decksService = createOIMBucketService(db, { slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    const writes: TSighting[] = [];
    const announcements: TSighting[] = [];
    const log = watchChannel(db, writes);
    OIMContentChangeListenerService.INSTANCE.addContentChangeListener(decks, createContentChangeListener(log, announcements), undefined);
    const createCards = (count: number, prefix = 'c') => {
        const cardSlots: TCardSlot[] = [];
        for (let i = 0; i < count; i++) {
            cardSlots.push(cardsService.slotContentService.upsertEntity(cards, { id: `${prefix}${i}`, deck: 'none' }));
        }
        return cardSlots;
    };
    const addByKey = (key: string, cardSlots: readonly TCardSlot[]): void => {
        membersService.addBucketMemberSlots(decksService.getSlotByKey(decks, key), cardSlots);
    };
    const removeByKey = (key: string, cardSlots: readonly TCardSlot[]): void => {
        const deck = decksService.findSlotByKey(decks, key);
        if (deck !== undefined) membersService.removeBucketMemberSlots(deck, cardSlots);
    };
    const writeByKey = (key: string, cardSlots: readonly TCardSlot[]) => {
        const deck = decksService.getSlotByKey(decks, key);
        membersService.writeBucketMemberSlots(deck, cardSlots);
        return deck;
    };
    return {
        db, cards, cardsService, decks, decksService, membersService, writes, announcements, log, createCards,
        addByKey, removeByKey, writeByKey,
    };
};

const createIndexFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const writes: TSighting[] = [];
    const announcements: TSighting[] = [];
    const log = watchChannel(db, writes);
    OIMContentChangeListenerService.INSTANCE.addContentChangeListener(byDeck, createContentChangeListener(log, announcements), undefined);
    return { db, cards, cardsService, byDeck, byDeckService, writes, announcements, log };
};

afterEach(() => {
    jest.restoreAllMocks();
});

describe('when a door that writes one item announces the bucket', () => {
    it('announces a one-item add once, while the door is still running', () => {
        const { db, decks, decksService, announcements, log, createCards, addByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const [a] = createCards(1);
        db.flush();

        runDoor(log, () => { addByKey('d', [a]); });

        const heard = sightingsOf(announcements, deck);
        expect(heard.length).toBe(1);
        expect(heard[0].isDoorRunning).toBe(true);
    });

    it('announces a one-item add at once, before the door\'s subframe starts to close', () => {
        const { db, decks, decksService, announcements, log, createCards, addByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const [a] = createCards(1);
        db.flush();

        runDoor(log, () => { addByKey('d', [a]); });

        expect(sightingsOf(announcements, deck).map(sighting => sighting.phase)).toEqual(['during']);
    });

    it('writes the bucket of a one-item add to the channel once, at once, inside the door\'s own subframe', () => {
        const { db, decks, decksService, writes, log, createCards, addByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const [a] = createCards(1);
        db.flush();

        runDoor(log, () => { addByKey('d', [a]); });

        const written = sightingsOf(writes, deck);
        expect(written.map(sighting => sighting.phase)).toEqual(['during']);
        expect(written[0].isDoorRunning).toBe(true);
        expect(written[0].isEmpty).toBe(false);
    });

    it('announces a one-item remove once, at once, while the door is still running', () => {
        const { db, decks, decksService, announcements, log, createCards, addByKey, removeByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const [a, b] = createCards(2);
        addByKey('d', [a, b]);
        db.flush();
        announcements.length = 0;

        runDoor(log, () => { removeByKey('d', [a]); });

        const heard = sightingsOf(announcements, deck);
        expect(heard.map(sighting => sighting.phase)).toEqual(['during']);
        expect(heard[0].isDoorRunning).toBe(true);
    });
});

describe('when a batch that changes a bucket more than once announces it', () => {
    it('announces a bucket given eight adds by key in one subframe twice: once at the first add and once at close, not eight times', () => {
        const { db, decks, decksService, membersService, announcements, createCards, addByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const eight = createCards(8);
        db.flush();

        openSubframe(db);
        addByKey('d', [eight[0]]);
        expect(sightingsOf(announcements, deck).length).toBe(1);
        for (let i = 1; i < eight.length; i++) addByKey('d', [eight[i]]);
        expect(sightingsOf(announcements, deck).length).toBe(1);
        closeSubframe(db);

        expect(sightingsOf(announcements, deck).length).toBe(2);
        expect(sightingsOf(announcements, deck, 'during').length).toBe(1);
        expect(sightingsOf(announcements, deck, 'atClose').length).toBe(1);
        expect(membersService.getBucketMemberSlotCount(deck)).toBe(8);
    });

    it('announces a bucket given eight adds by slot in one subframe twice', () => {
        const { db, decks, decksService, membersService, announcements, createCards } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const eight = createCards(8);
        db.flush();

        openSubframe(db);
        for (let i = 0; i < eight.length; i++) membersService.addBucketMemberSlots(deck, [eight[i]]);
        closeSubframe(db);

        expect(sightingsOf(announcements, deck, 'during').length).toBe(1);
        expect(sightingsOf(announcements, deck, 'atClose').length).toBe(1);
        expect(sightingsOf(announcements, deck).length).toBe(2);
    });

    it('announces eight buckets given one add each in one subframe eight times at once and none at close', () => {
        const { db, decks, decksService, announcements, createCards, addByKey } = createFixture();
        const eightDecks = [];
        for (let i = 0; i < 8; i++) eightDecks.push(decksService.holdSlotByKey(decks, `d${i}`));
        const eight = createCards(8);
        db.flush();

        openSubframe(db);
        for (let i = 0; i < 8; i++) addByKey(`d${i}`, [eight[i]]);
        expect(announcements.length).toBe(8);
        closeSubframe(db);

        expect(announcements.length).toBe(8);
        expect(announcements.filter(sighting => sighting.phase === 'during').length).toBe(8);
        expect(announcements.filter(sighting => sighting.phase === 'atClose').length).toBe(0);
        for (let i = 0; i < 8; i++) expect(sightingsOf(announcements, eightDecks[i]).length).toBe(1);
    });

    it('announces each of the eight index buckets one upsertEntities files into once, at once, and none at close', () => {
        const { db, cardsService, cards, byDeckService, byDeck, announcements, log } = createIndexFixture();
        const eightDecks = [];
        for (let i = 0; i < 8; i++) eightDecks.push(byDeckService.holdSlotByKey(byDeck, `d${i}`));
        db.flush();
        const entities: TCard[] = [];
        for (let i = 0; i < 8; i++) entities.push({ id: `c${i}`, deck: `d${i}` });

        runDoor(log, () => { cardsService.slotContentService.upsertEntities(cards, entities); });

        expect(announcements.length).toBe(8);
        expect(announcements.filter(sighting => sighting.phase === 'during').length).toBe(8);
        expect(announcements.filter(sighting => sighting.phase === 'atClose').length).toBe(0);
        for (let i = 0; i < 8; i++) expect(sightingsOf(announcements, eightDecks[i]).length).toBe(1);
    });
});

describe('when a batch empties a bucket and fills it again', () => {
    it('keeps an unheld bucket that a remove empties and an add refills inside one subframe, the same slot and not released', () => {
        const { db, decks, decksService, membersService, createCards, addByKey, removeByKey, writeByKey } = createFixture();
        const [a] = createCards(1);
        const deck = writeByKey('d', [a]);
        db.flush();
        expect(deck.holdCount).toBe(0);
        expect(oimIsSlotReleased(deck)).toBe(false);

        openSubframe(db);
        removeByKey('d', [a]);
        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(decksService.findSlotByKey(decks, 'd')).toBe(deck);
        addByKey('d', [a]);
        closeSubframe(db);

        expect(decksService.findSlotByKey(decks, 'd')).toBe(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(membersService.getBucketMemberSlotCount(deck)).toBe(1);
        db.flush();
        expect(decksService.findSlotByKey(decks, 'd')).toBe(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
    });

    it('keeps an unheld bucket that a whole write by key empties and writes again inside one subframe, the same slot and not released', () => {
        const { db, decks, decksService, membersService, createCards, writeByKey } = createFixture();
        const [a, b] = createCards(2);
        const deck = writeByKey('d', [a]);
        db.flush();

        openSubframe(db);
        expect(writeByKey('d', [])).toBe(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(writeByKey('d', [b])).toBe(deck);
        closeSubframe(db);

        expect(decksService.findSlotByKey(decks, 'd')).toBe(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(Array.from(membersService.getBucketMemberSlots(deck))).toEqual([b]);
    });

    it('keeps an unheld bucket that clearBucketMemberSlots empties and writeBucketMemberSlots refills inside one subframe', () => {
        const { db, decks, decksService, membersService, createCards, writeByKey } = createFixture();
        const [a, b] = createCards(2);
        const deck = writeByKey('d', [a, b]);
        db.flush();

        openSubframe(db);
        membersService.clearBucketMemberSlots(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        membersService.writeBucketMemberSlots(deck, [a, b]);
        closeSubframe(db);

        expect(decksService.findSlotByKey(decks, 'd')).toBe(deck);
        expect(oimIsSlotReleased(deck)).toBe(false);
        expect(membersService.getBucketMemberSlotCount(deck)).toBe(2);
    });

    it('releases an unheld bucket a batch leaves empty, at close and not before', () => {
        const { db, decks, decksService, createCards, addByKey, removeByKey, writeByKey } = createFixture();
        const [a, b] = createCards(2);
        const deck = writeByKey('d', [a]);
        db.flush();

        openSubframe(db);
        removeByKey('d', [a]);
        expect(oimIsSlotReleased(deck)).toBe(false);
        addByKey('d', [b]);
        removeByKey('d', [b]);
        expect(oimIsSlotReleased(deck)).toBe(false);
        closeSubframe(db);
        db.flush();

        expect(oimIsSlotReleased(deck)).toBe(true);
        expect(decksService.findSlotByKey(decks, 'd')).toBeUndefined();
    });
});

describe('what the channel is told about a bucket changed in a batch', () => {
    it('writes each of eight buckets changed in one subframe at least once, and none outside a subframe', () => {
        const { db, decks, decksService, writes, createCards, addByKey } = createFixture();
        const eightDecks = [];
        for (let i = 0; i < 8; i++) eightDecks.push(decksService.holdSlotByKey(decks, `d${i}`));
        const eight = createCards(8);
        db.flush();
        writes.length = 0;

        openSubframe(db);
        for (let i = 0; i < 8; i++) addByKey(`d${i}`, [eight[i]]);
        closeSubframe(db);

        for (let i = 0; i < 8; i++) {
            const written = sightingsOf(writes, eightDecks[i]);
            expect(written.length).toBeGreaterThanOrEqual(1);
            expect(written.every(sighting => sighting.phase !== 'outside')).toBe(true);
        }
    });

    it('writes a bucket changed eight times in one subframe at least once and at most twice', () => {
        const { db, decks, decksService, writes, createCards, addByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const eight = createCards(8);
        db.flush();
        writes.length = 0;

        openSubframe(db);
        for (let i = 0; i < eight.length; i++) addByKey('d', [eight[i]]);
        closeSubframe(db);

        const written = sightingsOf(writes, deck);
        expect(written.length).toBeGreaterThanOrEqual(1);
        expect(written.length).toBeLessThanOrEqual(2);
        expect(written.every(sighting => sighting.phase !== 'outside')).toBe(true);
    });

    it('leaves a held bucket emptied and refilled in one subframe not empty, as it was before the batch, and says so last', () => {
        const { db, decks, decksService, writes, announcements, createCards, addByKey, removeByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const [a] = createCards(1);
        addByKey('d', [a]);
        db.flush();
        writes.length = 0;
        announcements.length = 0;

        openSubframe(db);
        removeByKey('d', [a]);
        addByKey('d', [a]);
        closeSubframe(db);

        expect(oimIsSlotEmpty(deck)).toBe(false);
        const written = sightingsOf(writes, deck);
        expect(written.length).toBeGreaterThanOrEqual(1);
        expect(written[written.length - 1].isEmpty).toBe(false);
        const heard = sightingsOf(announcements, deck);
        expect(heard.length).toBe(2);
        expect(heard[heard.length - 1].phase).toBe('atClose');
        expect(heard[heard.length - 1].isEmpty).toBe(false);
    });

    it('leaves a held bucket filled and emptied in one subframe empty, as it was before the batch, and says so last', () => {
        const { db, decks, decksService, writes, announcements, createCards, addByKey, removeByKey } = createFixture();
        const deck = decksService.holdSlotByKey(decks, 'd');
        const [a] = createCards(1);
        db.flush();
        writes.length = 0;

        openSubframe(db);
        addByKey('d', [a]);
        removeByKey('d', [a]);
        closeSubframe(db);

        expect(oimIsSlotEmpty(deck)).toBe(true);
        const written = sightingsOf(writes, deck);
        expect(written.length).toBeGreaterThanOrEqual(1);
        expect(written[written.length - 1].isEmpty).toBe(true);
        const heard = sightingsOf(announcements, deck);
        expect(heard.length).toBe(2);
        expect(heard[heard.length - 1].phase).toBe('atClose');
        expect(heard[heard.length - 1].isEmpty).toBe(true);
    });
});
