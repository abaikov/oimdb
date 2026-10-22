import { OIMDB, OIMEffectService, createOIMEntityService, createOIMIndexServiceSortedArrayDriven } from '../../../index';

type TCard = { id: string; deck: string; rank: number; score: number; label: string };

const DECKS = ['d0', 'd1', 'd2'] as const;

const makeRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

const compareCards = (left: TCard, right: TCard): number => (left.rank - right.rank) || (right.score - left.score);

const createFixture = (initialCards: readonly TCard[]) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntities(cards, initialCards.map(card => ({ ...card })));
    db.flush();
    const byDeckService = createOIMIndexServiceSortedArrayDriven(db, {
        entityService: cardsService,
        columns: ['deck'],
        sortColumns: [{ column: 'rank', direction: 'asc' }, { column: 'score', direction: 'desc' }],
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const bucketSlots = new Map<string, ReturnType<typeof byDeckService.holdSlotByKey>>();
    const woken = new Map<string, number>();
    for (const deck of DECKS) {
        bucketSlots.set(deck, byDeckService.holdSlotByKey(byDeck, deck));
        woken.set(deck, 0);
    }
    for (const deck of DECKS) {
        OIMEffectService.INSTANCE.createEffect(db, [bucketSlots.get(deck)!], [], () => { woken.set(deck, (woken.get(deck) ?? 0) + 1); });
    }
    db.flush();
    const takeWoken = (deck: string): number => {
        const was = woken.get(deck) ?? 0;
        woken.set(deck, 0);
        return was;
    };
    for (const deck of DECKS) takeWoken(deck);
    const idsOf = (deck: string): string[] => byDeckService.getEntitiesByKey(byDeck, deck).map(card => card?.id ?? '?');
    return { db, cards, cardsService, byDeck, byDeckService, bucketSlots, takeWoken, idsOf };
};

const run = (seed: number, steps: number): void => {
    const random = makeRandom(seed);
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
    const nextRank = (): number => Math.floor(random() * 5);
    const nextScore = (): number => Math.floor(random() * 3);
    let nextId = 0;
    const freshCard = (): TCard => ({
        id: `c${nextId++}`, deck: pick(DECKS), rank: nextRank(), score: nextScore(), label: `l${Math.floor(random() * 3)}`,
    });

    const initialCards: TCard[] = [];
    for (let i = 0; i < 12; i++) initialCards.push(freshCard());
    const { db, cards, cardsService, byDeckService, bucketSlots, takeWoken, idsOf } = createFixture(initialCards);

    const model = new Map<string, TCard>();
    for (const card of initialCards) model.set(card.id, { ...card });
    const arrivals = new Map<string, string[]>();
    for (const deck of DECKS) arrivals.set(deck, initialCards.filter(card => card.deck === deck).map(card => card.id));
    const arrive = (deck: string, id: string): void => { arrivals.get(deck)!.push(id); };
    const leave = (deck: string, id: string): void => {
        const ids = arrivals.get(deck)!;
        ids.splice(ids.indexOf(id), 1);
    };
    const expectedIdsOf = (deck: string): string[] =>
        arrivals.get(deck)!.slice().sort((left, right) => compareCards(model.get(left)!, model.get(right)!));

    const assertEveryDeck = (wakingDecks: ReadonlySet<string>, step: number): void => {
        for (const deck of DECKS) {
            const expectedIds = expectedIdsOf(deck);
            expect({ seed, step, deck, ids: idsOf(deck) }).toEqual({ seed, step, deck, ids: expectedIds });
            const bucketSlot = bucketSlots.get(deck)!;
            for (let i = 0; i < expectedIds.length; i++) {
                expect(byDeckService.slotContentService.getBucketMemberSlotAt(bucketSlot, i)?.key).toBe(expectedIds[i]);
                expect(byDeckService.slotContentService.getBucketMemberSlotPosition(bucketSlot, cardsService.findSlotByKey(cards, expectedIds[i])!)).toBe(i);
            }
            expect(byDeckService.slotContentService.getBucketMemberSlotAt(bucketSlot, expectedIds.length)).toBeUndefined();
            expect({ seed, step, deck, woken: takeWoken(deck) }).toEqual({ seed, step, deck, woken: wakingDecks.has(deck) ? 1 : 0 });
        }
    };

    assertEveryDeck(new Set(), -1);

    for (let step = 0; step < steps; step++) {
        const liveIds = Array.from(model.keys());
        const choice = random();
        const wakingDecks = new Set<string>();

        if (liveIds.length === 0 || choice < 0.15) {
            const card = freshCard();
            cardsService.slotContentService.upsertEntity(cards, { ...card });
            model.set(card.id, card);
            arrive(card.deck, card.id);
            wakingDecks.add(card.deck);
        } else if (choice < 0.25) {
            const id = pick(liveIds);
            const card = model.get(id)!;
            const cardSlot = cardsService.findSlotByKey(cards, id);
            if (cardSlot !== undefined) cardsService.slotContentService.deleteEntity(cardSlot);
            model.delete(id);
            leave(card.deck, id);
            wakingDecks.add(card.deck);
        } else if (choice < 0.4) {
            const id = pick(liveIds);
            const card = model.get(id)!;
            const deck = pick(DECKS.filter(candidate => candidate !== card.deck));
            const cardSlot = cardsService.findSlotByKey(cards, id);
            if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, { deck });
            model.set(id, { ...card, deck });
            leave(card.deck, id);
            arrive(deck, id);
            wakingDecks.add(card.deck);
            wakingDecks.add(deck);
        } else if (choice < 0.6) {
            const id = pick(liveIds);
            const card = model.get(id)!;
            const isRank = random() < 0.5;
            const next = isRank ? { ...card, rank: card.rank + 1 + Math.floor(random() * 3) } : { ...card, score: (card.score + 1) % 3 };
            cardsService.slotContentService.upsertEntity(cards, { ...next });
            model.set(id, next);
            leave(card.deck, id);
            arrive(card.deck, id);
            wakingDecks.add(card.deck);
        } else if (choice < 0.68) {
            const id = pick(liveIds);
            const card = model.get(id)!;
            const cardSlot = cardsService.findSlotByKey(cards, id);
            if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, { rank: card.rank });
        } else if (choice < 0.8) {
            const id = pick(liveIds);
            const card = model.get(id)!;
            const label = `${card.label}x`;
            const cardSlot = cardsService.findSlotByKey(cards, id);
            if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, { label });
            model.set(id, { ...card, label });
        } else if (choice < 0.9) {
            const arriving: TCard[] = [];
            const arrivingCount = 1 + Math.floor(random() * 20);
            for (let i = 0; i < arrivingCount; i++) arriving.push(freshCard());
            cardsService.slotContentService.upsertEntities(cards, arriving.map(card => ({ ...card })));
            for (const card of arriving) {
                model.set(card.id, card);
                arrive(card.deck, card.id);
                wakingDecks.add(card.deck);
            }
        } else {
            const reranked = liveIds.filter(() => random() < 0.5);
            const nextCards = reranked.map(id => {
                const card = model.get(id)!;
                return { ...card, rank: card.rank + 1 + Math.floor(random() * 3) };
            });
            cardsService.slotContentService.upsertEntities(cards, nextCards.map(card => ({ ...card })));
            for (const card of nextCards) {
                model.set(card.id, card);
                leave(card.deck, card.id);
                arrive(card.deck, card.id);
                wakingDecks.add(card.deck);
            }
        }
        db.flush();
        assertEveryDeck(wakingDecks, step);
    }
};

describe('an index sorted at write time', () => {
    it.each([1, 7, 42, 1337, 90210])('keeps every bucket in sort-column order, ties by arrival, against a naive model (seed %i)', seed => {
        run(seed, 200);
    });

    it('sorts the members of a bucket minted over a populated collection', () => {
        const { idsOf } = createFixture([
            { id: 'a', deck: 'd0', rank: 3, score: 0, label: '' },
            { id: 'b', deck: 'd0', rank: 1, score: 0, label: '' },
            { id: 'c', deck: 'd1', rank: 0, score: 0, label: '' },
            { id: 'd', deck: 'd0', rank: 1, score: 2, label: '' },
        ]);

        expect(idsOf('d0')).toEqual(['d', 'b', 'a']);
        expect(idsOf('d1')).toEqual(['c']);
    });

    it('places a batch of many arrivals in one write and wakes their bucket once', () => {
        const { db, cardsService, cards, takeWoken, idsOf } = createFixture([]);
        const arriving: TCard[] = [];
        for (let i = 0; i < 40; i++) arriving.push({ id: `c${i}`, deck: 'd0', rank: (i * 7) % 5, score: i % 3, label: '' });

        cardsService.slotContentService.upsertEntities(cards, arriving);
        db.flush();

        expect(idsOf('d0')).toEqual(arriving.slice().sort(compareCards).map(card => card.id));
        expect(takeWoken('d0')).toBe(1);
        expect(takeWoken('d1')).toBe(0);
    });

    it('repositions a member whose sort column changes and wakes its bucket once per frame', () => {
        const { db, cardsService, cards, takeWoken, idsOf } = createFixture([
            { id: 'a', deck: 'd0', rank: 1, score: 0, label: '' },
            { id: 'b', deck: 'd0', rank: 2, score: 0, label: '' },
            { id: 'c', deck: 'd0', rank: 3, score: 0, label: '' },
        ]);

        const a = cardsService.findSlotByKey(cards, 'a');
        if (a !== undefined) cardsService.slotContentService.updateEntity(a, { rank: 5 });
        const c = cardsService.findSlotByKey(cards, 'c');
        if (c !== undefined) cardsService.slotContentService.updateEntity(c, { rank: 0 });
        db.flush();

        expect(idsOf('d0')).toEqual(['c', 'b', 'a']);
        expect(takeWoken('d0')).toBe(1);
    });

    it('moves a member between buckets when its key column changes', () => {
        const { db, cardsService, cards, takeWoken, idsOf } = createFixture([
            { id: 'a', deck: 'd0', rank: 1, score: 0, label: '' },
            { id: 'b', deck: 'd1', rank: 0, score: 0, label: '' },
            { id: 'c', deck: 'd1', rank: 2, score: 0, label: '' },
        ]);

        const a = cardsService.findSlotByKey(cards, 'a');
        if (a !== undefined) cardsService.slotContentService.updateEntity(a, { deck: 'd1' });
        db.flush();

        expect(idsOf('d0')).toEqual([]);
        expect(idsOf('d1')).toEqual(['b', 'a', 'c']);
        expect(takeWoken('d0')).toBe(1);
        expect(takeWoken('d1')).toBe(1);
    });

    it('drops a deleted member and keeps the rest in order', () => {
        const { db, cardsService, cards, idsOf } = createFixture([
            { id: 'a', deck: 'd0', rank: 1, score: 0, label: '' },
            { id: 'b', deck: 'd0', rank: 0, score: 0, label: '' },
            { id: 'c', deck: 'd0', rank: 2, score: 0, label: '' },
        ]);

        const b = cardsService.findSlotByKey(cards, 'b');
        if (b !== undefined) cardsService.slotContentService.deleteEntity(b);
        db.flush();

        expect(idsOf('d0')).toEqual(['a', 'c']);
    });

    it('neither reorders nor wakes a bucket on a write to a column that is neither key nor sort', () => {
        const { db, cardsService, cards, takeWoken, idsOf } = createFixture([
            { id: 'a', deck: 'd0', rank: 1, score: 0, label: '' },
            { id: 'b', deck: 'd0', rank: 1, score: 0, label: '' },
        ]);

        const a = cardsService.findSlotByKey(cards, 'a');
        if (a !== undefined) cardsService.slotContentService.updateEntity(a, { label: 'changed' });
        db.flush();

        expect(idsOf('d0')).toEqual(['a', 'b']);
        expect(takeWoken('d0')).toBe(0);
    });

    it('does not move a member on a write to a bucket column that is read but is not a sort column', () => {
        const { db, cardsService, cards, byDeck, byDeckService, idsOf } = createFixture([
            { id: 'a', deck: 'd0', rank: 1, score: 0, label: '' },
            { id: 'b', deck: 'd0', rank: 1, score: 0, label: '' },
        ]);
        byDeckService.holdBucketColumnByKey(byDeck, 'd0', 'label');
        db.flush();

        const a = cardsService.findSlotByKey(cards, 'a');
        if (a !== undefined) cardsService.slotContentService.updateEntity(a, { label: 'changed' });
        db.flush();

        expect(idsOf('d0')).toEqual(['a', 'b']);
    });
});
