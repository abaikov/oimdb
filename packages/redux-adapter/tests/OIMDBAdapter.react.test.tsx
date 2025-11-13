import * as React from 'react';
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
import { Provider, useSelector } from 'react-redux';
import {
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMReactiveIndexManualArrayBased,
    OIMReactiveIndexArrayBased,
    OIMIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';
import {
    useSelectEntityByPk,
    useSelectEntitiesByIndexKeyArrayBased,
} from '@oimdb/react';
import { OIMDBAdapter, TOIMDefaultCollectionState } from '../src';
import { createStore, applyMiddleware, Action, combineReducers } from 'redux';

interface User {
    id: string;
    name: string;
    age: number;
    email: string;
}

// Helper component to track renders
function RenderTracker({
    onRender,
    children,
}: {
    onRender: () => void;
    children?: React.ReactNode;
}) {
    useEffect(() => {
        onRender();
    });
    return <>{children}</>;
}

describe('OIMDBAdapter - React Render Optimization Tests', () => {
    let queue: OIMEventQueue;
    let collection: OIMReactiveCollection<User, string>;
    let adapter: OIMDBAdapter;
    let store: ReturnType<typeof createStore>;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
        collection = new OIMReactiveCollection<User, string>(queue);
        adapter = new OIMDBAdapter(queue);

        const reducer = adapter.createCollectionReducer(collection);
        const middleware = adapter.createMiddleware();
        store = createStore(reducer, applyMiddleware(middleware));
        adapter.setStore(store);
    });

    afterEach(() => {
        queue.destroy();
    });

    describe('Case 1: Redux updates, render from OIMDB collections', () => {
        test('should minimize re-renders when Redux updates but component reads from OIMDB', () => {
            // Setup child reducer for two-way sync
            const childReducer = (
                state: TOIMDefaultCollectionState<User, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER_NAME') {
                    const typedAction = action as {
                        type: string;
                        id: string;
                        name: string;
                    };
                    return {
                        ...state,
                        entities: {
                            ...state.entities,
                            [typedAction.id]: {
                                ...state.entities[typedAction.id],
                                name: typedAction.name,
                            },
                        },
                    };
                }
                return state;
            };

            const childOptions = {
                reducer: childReducer,
                getPk: (entity: User) => entity.id,
            };

            const reducerWithChild = adapter.createCollectionReducer(
                collection,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const storeWithChild = createStore(
                reducerWithChild,
                applyMiddleware(middleware)
            );
            adapter.setStore(storeWithChild);

            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            queue.flush();

            let user1RenderCount = 0;
            let user2RenderCount = 0;
            let user3RenderCount = 0;

            const User1Component = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User2Component = () => {
                const user = useSelectEntityByPk(collection, '2');
                return (
                    <RenderTracker
                        onRender={() => {
                            user2RenderCount++;
                        }}
                    >
                        <div data-testid="user2">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User3Component = () => {
                const user = useSelectEntityByPk(collection, '3');
                return (
                    <RenderTracker
                        onRender={() => {
                            user3RenderCount++;
                        }}
                    >
                        <div data-testid="user3">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <Provider store={storeWithChild}>
                    <div>
                        <User1Component />
                        <User2Component />
                        <User3Component />
                    </div>
                </Provider>
            );

            // Initial renders
            expect(user1RenderCount).toBeGreaterThan(0);
            expect(user2RenderCount).toBeGreaterThan(0);
            expect(user3RenderCount).toBeGreaterThan(0);

            // Verify initial values
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('user3').textContent).toBe('Charlie');

            const initialUser1Count = user1RenderCount;
            const initialUser2Count = user2RenderCount;
            const initialUser3Count = user3RenderCount;

            // Update Redux state (this will sync to OIMDB via child reducer)
            act(() => {
                storeWithChild.dispatch({
                    type: 'UPDATE_USER_NAME',
                    id: '1',
                    name: 'Alice Updated',
                });
                // Middleware automatically flushes
            });

            // Components reading from OIMDB should only re-render if their entity changed
            // User1 should re-render exactly once (entity '1' changed)
            expect(user1RenderCount).toBe(initialUser1Count + 1);
            // User2 and User3 should NOT re-render at all (their entities unchanged)
            expect(user2RenderCount).toBe(initialUser2Count);
            expect(user3RenderCount).toBe(initialUser3Count);

            // Verify updated values
            expect(getByTestId('user1').textContent).toBe('Alice Updated');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('user3').textContent).toBe('Charlie');
        });

        test('should not re-render when unrelated Redux state changes', () => {
            // Setup child reducer for two-way sync
            const childReducer = (
                state: TOIMDefaultCollectionState<User, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER_NAME') {
                    const typedAction = action as {
                        type: string;
                        id: string;
                        name: string;
                    };
                    return {
                        ...state,
                        entities: {
                            ...state.entities,
                            [typedAction.id]: {
                                ...state.entities[typedAction.id],
                                name: typedAction.name,
                            },
                        },
                    };
                }
                return state;
            };

            const childOptions = {
                reducer: childReducer,
                getPk: (entity: User) => entity.id,
            };

            const reducerWithChild = adapter.createCollectionReducer(
                collection,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const storeWithChild = createStore(
                reducerWithChild,
                applyMiddleware(middleware)
            );
            adapter.setStore(storeWithChild);

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            let user1RenderCount = 0;

            const User1Component = () => {
                const user = useSelectEntityByPk(collection, '1');
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <Provider store={storeWithChild}>
                    <User1Component />
                </Provider>
            );

            expect(getByTestId('user1').textContent).toBe('Alice');
            const initialCount = user1RenderCount;

            // Update Redux state for user2 (unrelated)
            act(() => {
                storeWithChild.dispatch({
                    type: 'UPDATE_USER_NAME',
                    id: '2',
                    name: 'Bob Updated',
                });
            });

            // User1 should NOT re-render (unrelated entity)
            expect(user1RenderCount).toBe(initialCount);
            expect(getByTestId('user1').textContent).toBe('Alice');
        });
    });

    describe('Case 2: OIMDB updates, render from Redux state', () => {
        test('should minimize re-renders when OIMDB updates but component reads from Redux', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            queue.flush();

            let user1RenderCount = 0;
            let user2RenderCount = 0;
            let user3RenderCount = 0;

            const User1Component = () => {
                const user = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => state.entities['1']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User2Component = () => {
                const user = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => state.entities['2']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            user2RenderCount++;
                        }}
                    >
                        <div data-testid="user2">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const User3Component = () => {
                const user = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => state.entities['3']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            user3RenderCount++;
                        }}
                    >
                        <div data-testid="user3">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <Provider store={store}>
                    <div>
                        <User1Component />
                        <User2Component />
                        <User3Component />
                    </div>
                </Provider>
            );

            // Initial renders
            expect(user1RenderCount).toBeGreaterThan(0);
            expect(user2RenderCount).toBeGreaterThan(0);
            expect(user3RenderCount).toBeGreaterThan(0);

            // Verify initial values
            expect(getByTestId('user1').textContent).toBe('Alice');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('user3').textContent).toBe('Charlie');

            const initialUser1Count = user1RenderCount;
            const initialUser2Count = user2RenderCount;
            const initialUser3Count = user3RenderCount;

            // Update OIMDB directly (this will sync to Redux)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Components reading from Redux should only re-render if their entity changed
            // User1 should re-render exactly once (entity '1' changed in Redux)
            expect(user1RenderCount).toBe(initialUser1Count + 1);
            // User2 and User3 should NOT re-render at all (their entities unchanged in Redux)
            expect(user2RenderCount).toBe(initialUser2Count);
            expect(user3RenderCount).toBe(initialUser3Count);

            // Verify updated values
            expect(getByTestId('user1').textContent).toBe('Alice Updated');
            expect(getByTestId('user2').textContent).toBe('Bob');
            expect(getByTestId('user3').textContent).toBe('Charlie');
        });

        test('should not re-render when unrelated OIMDB entity changes', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            let user1RenderCount = 0;

            const User1Component = () => {
                const user = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => state.entities['1']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            user1RenderCount++;
                        }}
                    >
                        <div data-testid="user1">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <Provider store={store}>
                    <User1Component />
                </Provider>
            );

            expect(getByTestId('user1').textContent).toBe('Alice');
            const initialCount = user1RenderCount;

            // Update OIMDB for user2 (unrelated)
            act(() => {
                collection.upsertOne({
                    id: '2',
                    name: 'Bob Updated',
                    age: 26,
                    email: 'bob@test.com',
                });
                queue.flush();
            });

            // User1 should NOT re-render (unrelated entity in Redux)
            expect(user1RenderCount).toBe(initialCount);
            expect(getByTestId('user1').textContent).toBe('Alice');
        });

        test('should handle multiple entities with minimal re-renders', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            ]);
            queue.flush();

            let component1RenderCount = 0;
            let component2RenderCount = 0;

            const Component1 = () => {
                const users = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => [state.entities['1'], state.entities['2']],
                    (a, b) => {
                        // Custom equality check - only re-render if users actually changed
                        if (!a || !b) return a === b;
                        if (a.length !== b.length) return false;
                        for (let i = 0; i < a.length; i++) {
                            if (a[i]?.id !== b[i]?.id) return false;
                            if (a[i] !== b[i]) return false; // Reference equality for objects
                        }
                        return true;
                    }
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            component1RenderCount++;
                        }}
                    >
                        <div data-testid="comp1">
                            {users
                                ?.map((u: User | undefined) => u?.name)
                                .join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const Component2 = () => {
                const user = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => state.entities['3']
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            component2RenderCount++;
                        }}
                    >
                        <div data-testid="comp2">{user?.name}</div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <Provider store={store}>
                    <div>
                        <Component1 />
                        <Component2 />
                    </div>
                </Provider>
            );

            expect(getByTestId('comp1').textContent).toBe('Alice, Bob');
            expect(getByTestId('comp2').textContent).toBe('Charlie');

            const initialComp1Count = component1RenderCount;
            const initialComp2Count = component2RenderCount;

            // Update entity '1' (subscribed by Component1)
            act(() => {
                collection.upsertOne({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                });
                queue.flush();
            });

            // Only Component1 should re-render (exactly one more render)
            // Component2 should NOT re-render at all
            expect(component1RenderCount).toBe(initialComp1Count + 1);
            expect(component2RenderCount).toBe(initialComp2Count);
            expect(getByTestId('comp1').textContent).toBe('Alice Updated, Bob');
            expect(getByTestId('comp2').textContent).toBe('Charlie');

            // Update entity '3' (subscribed by Component2)
            act(() => {
                collection.upsertOne({
                    id: '3',
                    name: 'Charlie Updated',
                    age: 36,
                    email: 'charlie@test.com',
                });
                queue.flush();
            });

            // Only Component2 should re-render exactly once
            expect(component2RenderCount).toBe(initialComp2Count + 1);
            // Component1 should NOT re-render (entity '3' not in its subscription)
            expect(component1RenderCount).toBe(initialComp1Count + 1); // Still +1 from previous update
            expect(getByTestId('comp1').textContent).toBe('Alice Updated, Bob');
            expect(getByTestId('comp2').textContent).toBe('Charlie Updated');
        });

        test('should not re-render when Redux state updates but selector returns same values (reference equality)', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            let componentRenderCount = 0;

            const Component = () => {
                const users = useSelector(
                    (state: {
                        entities: Record<string, User>;
                        ids: string[];
                    }) => [state.entities['1'], state.entities['2']],
                    (a, b) => {
                        // Custom equality check - only re-render if users actually changed
                        if (!a || !b) return a === b;
                        if (a.length !== b.length) return false;
                        for (let i = 0; i < a.length; i++) {
                            if (a[i]?.id !== b[i]?.id) return false;
                            if (a[i] !== b[i]) return false; // Reference equality for objects
                        }
                        return true;
                    }
                );
                return (
                    <RenderTracker
                        onRender={() => {
                            componentRenderCount++;
                        }}
                    >
                        <div data-testid="comp">
                            {users
                                ?.map((u: User | undefined) => u?.name)
                                .join(', ') || ''}
                        </div>
                    </RenderTracker>
                );
            };

            const { getByTestId } = render(
                <Provider store={store}>
                    <Component />
                </Provider>
            );

            expect(getByTestId('comp').textContent).toBe('Alice, Bob');
            const initialCount = componentRenderCount;

            // Update unrelated entity '3' (not in subscription)
            act(() => {
                collection.upsertOne({
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                });
                queue.flush();
            });

            // Component should NOT re-render (entities '1' and '2' unchanged)
            expect(componentRenderCount).toBe(initialCount);
            expect(getByTestId('comp').textContent).toBe('Alice, Bob');
        });
    });

    describe('Linked Indexes (ArrayBased) - Render Optimization', () => {
        interface Deck {
            id: string;
            cardIds: string[];
            name: string;
        }

        interface Card {
            id: string;
            name: string;
            deckId: string;
        }

        let decksCollection: OIMReactiveCollection<Deck, string>;
        let cardsCollection: OIMReactiveCollection<Card, string>;
        let cardsByDeckIndex: OIMReactiveIndexManualArrayBased<string, string>;

        beforeEach(() => {
            decksCollection = new OIMReactiveCollection<Deck, string>(queue, {
                selectPk: deck => deck.id,
            });
            cardsCollection = new OIMReactiveCollection<Card, string>(queue, {
                selectPk: card => card.id,
            });
            cardsByDeckIndex = new OIMReactiveIndexManualArrayBased<
                string,
                string
            >(queue);
        });

        describe('Case 1: Redux updates, render from OIMDB via linked index', () => {
            test('should minimize re-renders when Redux updates deck cardIds but component reads from OIMDB index', () => {
                // Setup child reducer with linked index
                const childReducer = (
                    state: TOIMDefaultCollectionState<Deck, string> | undefined,
                    action: Action
                ): TOIMDefaultCollectionState<Deck, string> => {
                    if (state === undefined) {
                        return { entities: {}, ids: [] };
                    }
                    if (action.type === 'UPDATE_DECK_CARDS') {
                        const typedAction = action as {
                            type: string;
                            deckId: string;
                            cardIds: string[];
                        };
                        const deck = state.entities[typedAction.deckId];
                        if (deck) {
                            return {
                                ...state,
                                entities: {
                                    ...state.entities,
                                    [typedAction.deckId]: {
                                        ...deck,
                                        cardIds: typedAction.cardIds,
                                    },
                                },
                            };
                        }
                    }
                    return state;
                };

                const childOptions = {
                    reducer: childReducer,
                    getPk: (deck: Deck) => deck.id,
                    linkedIndexes: [
                        {
                            index: cardsByDeckIndex as unknown as OIMReactiveIndexArrayBased<
                                TOIMPk,
                                string,
                                OIMIndexArrayBased<TOIMPk, string>
                            >,
                            fieldName: 'cardIds' as keyof Deck,
                        },
                    ],
                };

                const reducerWithChild = adapter.createCollectionReducer(
                    decksCollection,
                    childOptions
                );
                const middleware = adapter.createMiddleware();
                const storeWithChild = createStore(
                    reducerWithChild,
                    applyMiddleware(middleware)
                );
                adapter.setStore(storeWithChild);

                // Setup initial data
                decksCollection.upsertMany([
                    {
                        id: 'deck1',
                        cardIds: ['card1', 'card2'],
                        name: 'Deck 1',
                    },
                    {
                        id: 'deck2',
                        cardIds: ['card3'],
                        name: 'Deck 2',
                    },
                ]);
                cardsCollection.upsertMany([
                    { id: 'card1', name: 'Card 1', deckId: 'deck1' },
                    { id: 'card2', name: 'Card 2', deckId: 'deck1' },
                    { id: 'card3', name: 'Card 3', deckId: 'deck2' },
                ]);
                // Initialize index manually
                cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
                cardsByDeckIndex.setPks('deck2', ['card3']);
                queue.flush();

                let deck1CardsRenderCount = 0;
                let deck2CardsRenderCount = 0;

                const Deck1CardsComponent = () => {
                    const cards = useSelectEntitiesByIndexKeyArrayBased(
                        cardsCollection,
                        cardsByDeckIndex,
                        'deck1'
                    );
                    return (
                        <RenderTracker
                            onRender={() => {
                                deck1CardsRenderCount++;
                            }}
                        >
                            <div data-testid="deck1-cards">
                                {cards
                                    ?.map((c: Card | undefined) => c?.name)
                                    .join(', ') || ''}
                            </div>
                        </RenderTracker>
                    );
                };

                const Deck2CardsComponent = () => {
                    const cards = useSelectEntitiesByIndexKeyArrayBased(
                        cardsCollection,
                        cardsByDeckIndex,
                        'deck2'
                    );
                    return (
                        <RenderTracker
                            onRender={() => {
                                deck2CardsRenderCount++;
                            }}
                        >
                            <div data-testid="deck2-cards">
                                {cards
                                    ?.map((c: Card | undefined) => c?.name)
                                    .join(', ') || ''}
                            </div>
                        </RenderTracker>
                    );
                };

                const { getByTestId } = render(
                    <Provider store={storeWithChild}>
                        <div>
                            <Deck1CardsComponent />
                            <Deck2CardsComponent />
                        </div>
                    </Provider>
                );

                // Initial renders
                expect(deck1CardsRenderCount).toBeGreaterThan(0);
                expect(deck2CardsRenderCount).toBeGreaterThan(0);

                // Verify initial values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 1, Card 2'
                );
                expect(getByTestId('deck2-cards').textContent).toBe('Card 3');

                const initialDeck1Count = deck1CardsRenderCount;
                const initialDeck2Count = deck2CardsRenderCount;

                // Add card4 to collection first
                cardsCollection.upsertOne({
                    id: 'card4',
                    name: 'Card 4',
                    deckId: 'deck1',
                });
                queue.flush();

                // Update Redux state for deck1 (this will sync to OIMDB and linked index)
                act(() => {
                    storeWithChild.dispatch({
                        type: 'UPDATE_DECK_CARDS',
                        deckId: 'deck1',
                        cardIds: ['card2', 'card4'], // card1 removed, card4 added
                    });
                    queue.flush();
                });

                // Deck1CardsComponent should re-render exactly once (deck1 index changed)
                expect(deck1CardsRenderCount).toBe(initialDeck1Count + 1);
                // Deck2CardsComponent should NOT re-render at all (deck2 unchanged)
                expect(deck2CardsRenderCount).toBe(initialDeck2Count);

                // Verify updated values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 2, Card 4'
                );
                expect(getByTestId('deck2-cards').textContent).toBe('Card 3');
            });
        });

        describe('Case 2: OIMDB updates, render from Redux via linked index', () => {
            test('should minimize re-renders when OIMDB updates deck cardIds but component reads from Redux index', () => {
                // Setup reducer with linked index
                const childOptions = {
                    reducer: (
                        state:
                            | TOIMDefaultCollectionState<Deck, string>
                            | undefined
                    ) => {
                        return state || { entities: {}, ids: [] };
                    },
                    getPk: (deck: Deck) => deck.id,
                    linkedIndexes: [
                        {
                            index: cardsByDeckIndex as unknown as OIMReactiveIndexArrayBased<
                                TOIMPk,
                                string,
                                OIMIndexArrayBased<TOIMPk, string>
                            >,
                            fieldName: 'cardIds' as keyof Deck,
                        },
                    ],
                };

                const reducer = adapter.createCollectionReducer(
                    decksCollection,
                    childOptions
                );
                const middleware = adapter.createMiddleware();
                const storeWithIndex = createStore(
                    reducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(storeWithIndex);

                // Setup initial data
                decksCollection.upsertMany([
                    {
                        id: 'deck1',
                        cardIds: ['card1', 'card2'],
                        name: 'Deck 1',
                    },
                    {
                        id: 'deck2',
                        cardIds: ['card3'],
                        name: 'Deck 2',
                    },
                ]);
                cardsCollection.upsertMany([
                    { id: 'card1', name: 'Card 1', deckId: 'deck1' },
                    { id: 'card2', name: 'Card 2', deckId: 'deck1' },
                    { id: 'card3', name: 'Card 3', deckId: 'deck2' },
                ]);
                // Initialize index manually
                cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
                cardsByDeckIndex.setPks('deck2', ['card3']);
                queue.flush();

                let deck1CardsRenderCount = 0;
                let deck2CardsRenderCount = 0;

                const Deck1CardsComponent = () => {
                    const cards = useSelector(
                        (state: {
                            decks: {
                                entities: Record<string, Deck>;
                                ids: string[];
                            };
                            cards: {
                                entities: Record<string, Card>;
                                ids: string[];
                            };
                            cardsByDeck: {
                                entities: Record<
                                    string,
                                    { id: string; ids: string[] }
                                >;
                            };
                        }) => {
                            const deck = state.decks.entities['deck1'];
                            const cardIds = deck?.cardIds || [];
                            return cardIds.map(
                                (cardId: string) => state.cards.entities[cardId]
                            );
                        },
                        (a, b) => {
                            // Custom equality check - only re-render if cards actually changed
                            if (!a || !b) return a === b;
                            if (a.length !== b.length) return false;
                            for (let i = 0; i < a.length; i++) {
                                if (a[i]?.id !== b[i]?.id) return false;
                                if (a[i] !== b[i]) return false; // Reference equality for objects
                            }
                            return true;
                        }
                    );
                    return (
                        <RenderTracker
                            onRender={() => {
                                deck1CardsRenderCount++;
                            }}
                        >
                            <div data-testid="deck1-cards">
                                {cards
                                    ?.map((c: Card | undefined) => c?.name)
                                    .join(', ') || ''}
                            </div>
                        </RenderTracker>
                    );
                };

                const Deck2CardsComponent = () => {
                    const cards = useSelector(
                        (state: {
                            decks: {
                                entities: Record<string, Deck>;
                                ids: string[];
                            };
                            cards: {
                                entities: Record<string, Card>;
                                ids: string[];
                            };
                            cardsByDeck: {
                                entities: Record<
                                    string,
                                    { id: string; ids: string[] }
                                >;
                            };
                        }) => {
                            const deck = state.decks.entities['deck2'];
                            const cardIds = deck?.cardIds || [];
                            return cardIds.map(
                                (cardId: string) => state.cards.entities[cardId]
                            );
                        },
                        (a, b) => {
                            // Custom equality check - only re-render if cards actually changed
                            if (!a || !b) return a === b;
                            if (a.length !== b.length) return false;
                            for (let i = 0; i < a.length; i++) {
                                if (a[i]?.id !== b[i]?.id) return false;
                                if (a[i] !== b[i]) return false; // Reference equality for objects
                            }
                            return true;
                        }
                    );
                    return (
                        <RenderTracker
                            onRender={() => {
                                deck2CardsRenderCount++;
                            }}
                        >
                            <div data-testid="deck2-cards">
                                {cards
                                    ?.map((c: Card | undefined) => c?.name)
                                    .join(', ') || ''}
                            </div>
                        </RenderTracker>
                    );
                };

                // Create index reducer for Redux state
                const indexReducer =
                    adapter.createIndexReducer(cardsByDeckIndex);
                const rootReducer = combineReducers({
                    decks: reducer,
                    cards: adapter.createCollectionReducer(cardsCollection),
                    cardsByDeck: indexReducer,
                });
                const rootStore = createStore(
                    rootReducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(rootStore);

                queue.flush();

                const { getByTestId } = render(
                    <Provider store={rootStore}>
                        <div>
                            <Deck1CardsComponent />
                            <Deck2CardsComponent />
                        </div>
                    </Provider>
                );

                // Initial renders
                expect(deck1CardsRenderCount).toBeGreaterThan(0);
                expect(deck2CardsRenderCount).toBeGreaterThan(0);

                // Verify initial values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 1, Card 2'
                );
                expect(getByTestId('deck2-cards').textContent).toBe('Card 3');

                const initialDeck1Count = deck1CardsRenderCount;
                const initialDeck2Count = deck2CardsRenderCount;

                // Update OIMDB directly (this will sync to Redux and linked index)
                act(() => {
                    decksCollection.upsertOne({
                        id: 'deck1',
                        cardIds: ['card2', 'card4'], // card1 removed, card4 added
                        name: 'Deck 1',
                    });
                    cardsCollection.upsertOne({
                        id: 'card4',
                        name: 'Card 4',
                        deckId: 'deck1',
                    });
                    queue.flush();
                });

                // Deck1CardsComponent should re-render (deck1 changed in Redux)
                expect(deck1CardsRenderCount).toBeGreaterThan(
                    initialDeck1Count
                );
                // Deck2CardsComponent should NOT re-render (deck2 unchanged)
                expect(deck2CardsRenderCount).toBe(initialDeck2Count);

                // Verify updated values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 2, Card 4'
                );
                expect(getByTestId('deck2-cards').textContent).toBe('Card 3');
            });
        });

        describe('Case 3: Card entity changes in list', () => {
            test('should re-render when card entity changes in the list', () => {
                // Setup child reducer with linked index
                const childReducer = (
                    state: TOIMDefaultCollectionState<Deck, string> | undefined,
                    action: Action
                ): TOIMDefaultCollectionState<Deck, string> => {
                    if (state === undefined) {
                        return { entities: {}, ids: [] };
                    }
                    return state;
                };

                const childOptions = {
                    reducer: childReducer,
                    getPk: (deck: Deck) => deck.id,
                    linkedIndexes: [
                        {
                            index: cardsByDeckIndex as unknown as OIMReactiveIndexArrayBased<
                                TOIMPk,
                                string,
                                OIMIndexArrayBased<TOIMPk, string>
                            >,
                            fieldName: 'cardIds' as keyof Deck,
                        },
                    ],
                };

                const reducerWithChild = adapter.createCollectionReducer(
                    decksCollection,
                    childOptions
                );
                const cardsReducer =
                    adapter.createCollectionReducer(cardsCollection);
                const rootReducer = combineReducers({
                    decks: reducerWithChild,
                    cards: cardsReducer,
                });
                const middleware = adapter.createMiddleware();
                const storeWithChild = createStore(
                    rootReducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(storeWithChild);

                // Setup initial data
                decksCollection.upsertMany([
                    {
                        id: 'deck1',
                        cardIds: ['card1', 'card2'],
                        name: 'Deck 1',
                    },
                    {
                        id: 'deck2',
                        cardIds: ['card3'],
                        name: 'Deck 2',
                    },
                ]);
                cardsCollection.upsertMany([
                    { id: 'card1', name: 'Card 1', deckId: 'deck1' },
                    { id: 'card2', name: 'Card 2', deckId: 'deck1' },
                    { id: 'card3', name: 'Card 3', deckId: 'deck2' },
                ]);
                // Initialize index manually
                cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
                cardsByDeckIndex.setPks('deck2', ['card3']);
                queue.flush();

                let deck1CardsRenderCount = 0;
                let deck2CardsRenderCount = 0;

                const Deck1CardsComponent = () => {
                    const cards = useSelectEntitiesByIndexKeyArrayBased(
                        cardsCollection,
                        cardsByDeckIndex,
                        'deck1'
                    );
                    return (
                        <RenderTracker
                            onRender={() => {
                                deck1CardsRenderCount++;
                            }}
                        >
                            <div data-testid="deck1-cards">
                                {cards
                                    ?.map((c: Card | undefined) => c?.name)
                                    .join(', ') || ''}
                            </div>
                        </RenderTracker>
                    );
                };

                const Deck2CardsComponent = () => {
                    const cards = useSelectEntitiesByIndexKeyArrayBased(
                        cardsCollection,
                        cardsByDeckIndex,
                        'deck2'
                    );
                    return (
                        <RenderTracker
                            onRender={() => {
                                deck2CardsRenderCount++;
                            }}
                        >
                            <div data-testid="deck2-cards">
                                {cards
                                    ?.map((c: Card | undefined) => c?.name)
                                    .join(', ') || ''}
                            </div>
                        </RenderTracker>
                    );
                };

                const { getByTestId } = render(
                    <Provider store={storeWithChild}>
                        <div>
                            <Deck1CardsComponent />
                            <Deck2CardsComponent />
                        </div>
                    </Provider>
                );

                // Initial renders
                expect(deck1CardsRenderCount).toBeGreaterThan(0);
                expect(deck2CardsRenderCount).toBeGreaterThan(0);

                // Verify initial values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 1, Card 2'
                );
                expect(getByTestId('deck2-cards').textContent).toBe('Card 3');

                const initialDeck1Count = deck1CardsRenderCount;
                const initialDeck2Count = deck2CardsRenderCount;

                // Update card1 entity (in deck1's list)
                act(() => {
                    cardsCollection.upsertOne({
                        id: 'card1',
                        name: 'Card 1 Updated',
                        deckId: 'deck1',
                    });
                    queue.flush();
                });

                // Deck1CardsComponent should re-render exactly once (card1 changed)
                expect(deck1CardsRenderCount).toBe(initialDeck1Count + 1);
                // Deck2CardsComponent should NOT re-render (card3 unchanged)
                expect(deck2CardsRenderCount).toBe(initialDeck2Count);

                // Verify updated values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 1 Updated, Card 2'
                );
                expect(getByTestId('deck2-cards').textContent).toBe('Card 3');

                // Update card3 entity (in deck2's list)
                const newDeck1Count = deck1CardsRenderCount;
                const newDeck2Count = deck2CardsRenderCount;

                act(() => {
                    cardsCollection.upsertOne({
                        id: 'card3',
                        name: 'Card 3 Updated',
                        deckId: 'deck2',
                    });
                    queue.flush();
                });

                // Deck2CardsComponent should re-render exactly once (card3 changed)
                expect(deck2CardsRenderCount).toBe(newDeck2Count + 1);
                // Deck1CardsComponent should NOT re-render (card1 and card2 unchanged)
                expect(deck1CardsRenderCount).toBe(newDeck1Count);

                // Verify updated values
                expect(getByTestId('deck1-cards').textContent).toBe(
                    'Card 1 Updated, Card 2'
                );
                expect(getByTestId('deck2-cards').textContent).toBe(
                    'Card 3 Updated'
                );
            });
        });
    });
});
