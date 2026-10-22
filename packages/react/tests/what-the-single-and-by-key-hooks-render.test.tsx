import * as React from 'react';
import { act, render, screen } from '@testing-library/react';
import {
    OIMDB,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceSingleSlotDriven,
    createOIMComputedService,
    createOIMEntityService,
    createOIMIndexService,
    createOIMSingleBucketService,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMBucketSlotsSetStore, TOIMComputedSlot, TOIMEntitySlot, TOIMSingleSlotStore } from '@oimdb/core';
import {
    OIMDBProvider,
    useOIMComputedCollection,
    useOIMComputedValueByKey,
    useOIMEntity,
    useOIMSingleBucketSlots,
    useOIMSingleComputedValue,
    useOIMSingleEntity,
    useOIMSlotsByKeys,
    useOIMValue,
} from '../src/index';

type TCard = { id: string; deck: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSettings = { theme: string };

const build = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', deck: 'red', rank: 1 },
        { id: 'c2', deck: 'red', rank: 2 },
        { id: 'c3', deck: 'blue', rank: 3 },
    ]);
    db.flush();
    const updateCard = (key: string, patch: Partial<TCard>): void => {
        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, key), patch);
    };
    const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement =>
        <OIMDBProvider db={db}>{children}</OIMDBProvider>;
    return { db, cardsService, cards, updateCard, Wrapper };
};

type TSingleNumberStore = TOIMSingleSlotStore<TOIMComputedSlot<number, void>>;

const createSingleNumberService = () => createOIMComputedService<void, number, TSingleNumberStore>({
    computedSlotStoreService: OIMSlotStoreServiceSingleSlotDriven.INSTANCE as OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>,
});

describe('what the single and by-key hooks render', () => {
    it('useOIMComputedValueByKey renders one key of a computed collection and follows its source', () => {
        const { db, cardsService, cards, updateCard, Wrapper } = build();
        const ranksService = createOIMComputedService<string, number>({
            createSources: id => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
            derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        });
        const ranks = ranksService.createComputedStoreSlot(db);
        function Rank(): React.ReactElement {
            return <span data-testid="rank">{useOIMComputedValueByKey(ranksService.computedCollectionService, ranks, 'c1')}</span>;
        }
        render(<Rank />, { wrapper: Wrapper });
        expect(screen.getByTestId('rank').textContent).toBe('1');
        act(() => { updateCard('c1', { rank: 7 }); db.flush(); });
        expect(screen.getByTestId('rank').textContent).toBe('7');
    });

    it('useOIMSingleComputedValue builds one computed for the component and renders its value', () => {
        const { db, cardsService, cards, updateCard, Wrapper } = build();
        let builds = 0;
        const totalService = createSingleNumberService();
        function Total(): React.ReactElement {
            const total = useOIMSingleComputedValue(
                totalService,
                () => (cardsService.getSlotByKey(cards, 'c1').entity?.rank ?? 0) + (cardsService.getSlotByKey(cards, 'c2').entity?.rank ?? 0),
                () => {
                    builds++;
                    return { sourceSlots: [cardsService.getSlotByKey(cards, 'c1'), cardsService.getSlotByKey(cards, 'c2')] };
                },
                [],
            );
            return <span data-testid="total">{total}</span>;
        }
        render(<Total />, { wrapper: Wrapper });
        expect(screen.getByTestId('total').textContent).toBe('3');
        act(() => { updateCard('c2', { rank: 10 }); db.flush(); });
        expect(screen.getByTestId('total').textContent).toBe('11');
        expect(builds).toBe(1);
    });

    it('useOIMComputedCollection keeps one collection for the component while deps do not change', () => {
        const { cardsService, cards, Wrapper } = build();
        const seen = new Set<unknown>();
        const doubledService = createOIMComputedService<string, number>({});
        function Doubled({ id }: { id: string }): React.ReactElement {
            const doubled = useOIMComputedCollection(
                doubledService,
                computedSlot => (cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0) * 2,
                key => ({ sourceSlots: [cardsService.getSlotByKey(cards, key)] }),
                [],
            );
            seen.add(doubled);
            return <span data-testid="doubled">{useOIMComputedValueByKey(doubledService.computedCollectionService, doubled, id)}</span>;
        }
        const { rerender } = render(<Doubled id="c1" />, { wrapper: Wrapper });
        expect(screen.getByTestId('doubled').textContent).toBe('2');
        rerender(<Doubled id="c3" />);
        expect(screen.getByTestId('doubled').textContent).toBe('6');
        expect(seen.size).toBe(1);
    });

    it('useOIMSingleEntity renders a single entity and follows an update', () => {
        const { db, Wrapper } = build();
        const settingsService = createOIMSingleEntityService<TSettings>(db);
        const settings = settingsService.createStoreSlot(db);
        settingsService.slotContentService.upsertEntity(settings, { theme: 'dark' });
        db.flush();
        function Theme(): React.ReactElement {
            return <span data-testid="theme">{useOIMSingleEntity(settingsService, settings)?.theme}</span>;
        }
        render(<Theme />, { wrapper: Wrapper });
        expect(screen.getByTestId('theme').textContent).toBe('dark');
        act(() => {
            settingsService.slotContentService.updateEntity(settingsService.getSingleSlot(settings), { theme: 'light' });
            db.flush();
        });
        expect(screen.getByTestId('theme').textContent).toBe('light');
    });

    it('useOIMSingleBucketSlots renders a single bucket and follows an addition', () => {
        const { db, cardsService, cards, Wrapper } = build();
        const pickedService = createOIMSingleBucketService<
            TCardSlot, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
        const picked = pickedService.createStoreSlot(db);
        pickedService.slotContentService.writeBucketMemberSlots(
            pickedService.getSingleSlot(picked), [cardsService.getSlotByKey(cards, 'c1')],
        );
        db.flush();
        function Picked(): React.ReactElement {
            return <span data-testid="picked">{useOIMSingleBucketSlots(pickedService, picked).map(slot => slot.entity?.id).join(',')}</span>;
        }
        render(<Picked />, { wrapper: Wrapper });
        expect(screen.getByTestId('picked').textContent).toBe('c1');
        act(() => {
            pickedService.slotContentService.addBucketMemberSlots(pickedService.getSingleSlot(picked), [cardsService.getSlotByKey(cards, 'c3')]);
            db.flush();
        });
        expect(screen.getByTestId('picked').textContent).toBe('c1,c3');
    });

    it('useOIMSingleComputedValue survives a flush between render and subscribe, under StrictMode, and rebuilds on deps', () => {
        const { db, cardsService, cards, updateCard, Wrapper } = build();
        const rankService = createSingleNumberService();
        function Writer(): React.ReactElement {
            React.useLayoutEffect(() => { updateCard('c1', { rank: 5 }); db.flush(); }, []);
            return <span />;
        }
        function Rank({ id }: { id: string }): React.ReactElement {
            return <span data-testid="rank">{useOIMSingleComputedValue(
                rankService,
                () => cardsService.getSlotByKey(cards, id).entity?.rank ?? -1,
                () => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
                [id],
            )}</span>;
        }
        const { rerender } = render(
            <React.StrictMode><Rank id="c1" /><Writer /></React.StrictMode>, { wrapper: Wrapper },
        );
        expect(screen.getByTestId('rank').textContent).toBe('5');
        rerender(<React.StrictMode><Rank id="c3" /><Writer /></React.StrictMode>);
        expect(screen.getByTestId('rank').textContent).toBe('3');
        act(() => { updateCard('c3', { rank: 9 }); db.flush(); });
        expect(screen.getByTestId('rank').textContent).toBe('9');
    });

    it('a hook refuses a collection built on another database instead of never waking', () => {
        const { Wrapper } = build();
        const otherDb = new OIMDB();
        const otherCardsService = createOIMEntityService<TCard>(otherDb, { keyOf: card => card.id });
        const otherCards = otherCardsService.createStoreSlot(otherDb);
        function Title(): React.ReactElement {
            return <span>{useOIMEntity(otherCardsService, otherCards, 'c1')?.id}</span>;
        }
        const silence = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(() => render(<Title />, { wrapper: Wrapper })).toThrow(/useOIMEntity: the slot was filed on another OIMDB/);
        silence.mockRestore();
    });

    it('a hook under OIMDBProvider runs on the database it was given', () => {
        const { db, cardsService, cards, updateCard } = build();
        const rankService = createSingleNumberService();
        function Rank(): React.ReactElement {
            return <span data-testid="rank">{useOIMSingleComputedValue(
                rankService,
                () => cardsService.getSlotByKey(cards, 'c2').entity?.rank ?? -1,
                () => ({ sourceSlots: [cardsService.getSlotByKey(cards, 'c2')] }),
                [],
            )}</span>;
        }
        render(<OIMDBProvider db={db}><Rank /></OIMDBProvider>);
        expect(screen.getByTestId('rank').textContent).toBe('2');
        act(() => { updateCard('c2', { rank: 4 }); db.flush(); });
        expect(screen.getByTestId('rank').textContent).toBe('4');
    });

    it('an index bucket by key is useOIMSlotsByKeys plus useOIMValue over the index', () => {
        const { db, cardsService, cards, updateCard, Wrapper } = build();
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            columns: ['deck'],
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        function Deck(): React.ReactElement {
            const [red] = useOIMSlotsByKeys(byDeckService, byDeck, ['red']);
            const ids = useOIMValue(React.useMemo(() => ({
                sourceSlots: [red],
                derive: () => Array.from(byDeckService.slotContentService.getBucketMemberSlots(red), slot => slot.entity?.id).sort(),
            }), [red]));
            return <span data-testid="deck">{ids.join(',')}</span>;
        }
        render(<Deck />, { wrapper: Wrapper });
        expect(screen.getByTestId('deck').textContent).toBe('c1,c2');
        act(() => { updateCard('c3', { deck: 'red' }); db.flush(); });
        expect(screen.getByTestId('deck').textContent).toBe('c1,c2,c3');
    });
});
