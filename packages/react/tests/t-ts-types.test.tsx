import * as React from 'react';
import { render } from '@testing-library/react';
import {
    OIMEventQueue,
    OIMReactiveIndexManualArrayBased,
    OIMRICollection,
} from '@oimdb/core';
import {
    OIMRICollectionsProvider,
    useOIMCollectionsContext,
    CollectionsDictionary,
} from '../src/context';
import {
    useSelectEntityByPk,
    useSelectEntitiesByPks,
    useSelectEntitiesByIndexKeyArrayBased,
    useSelectPksByIndexKeyArrayBased,
} from '../src/hooks';

// Types from t.ts
type ID = string;

interface Deck {
    id: ID;
    name: string;
    createdAt: number;
}

interface Card {
    id: ID;
    deckId: ID;
    title: string;
    content: string;
    isVisible?: boolean;
    updatedAt?: number;
}

interface Comment {
    id: ID;
    cardId: ID;
    text: string;
    isEditing?: boolean;
    createdAt: number;
}

interface User {
    id: ID;
    name: string;
    email: string;
}

interface Tag {
    id: ID;
    name: string;
    color?: string;
}

interface CardAssignment {
    id: ID;
    cardId: ID;
    userId: ID;
    createdAt: number;
}

interface CardTag {
    id: ID;
    cardId: ID;
    tagId: ID;
    createdAt: number;
}

type AppState = {
    id: 'app';
    activeDeckId: ID | null;
};

interface RootState {
    entities: {
        decks: Record<ID, Deck>;
        cards: Record<ID, Card>;
        comments: Record<ID, Comment>;
        users: Record<ID, User>;
        tags: Record<ID, Tag>;
        cardAssignments: Record<ID, CardAssignment>;
        cardTags: Record<ID, CardTag>;
    };
    activeDeckId: ID | null;
    decksOrder: ID[];
}

// Exact function from t.ts
function createOimdbStore(initialData: RootState) {
    const queue = new OIMEventQueue({});

    const cardsByDeckIndex = new OIMReactiveIndexManualArrayBased<
        string,
        string
    >(queue);

    const allCardsIndex = new OIMReactiveIndexManualArrayBased<string, string>(
        queue
    );

    const commentsByCardIndex = new OIMReactiveIndexManualArrayBased<
        string,
        string
    >(queue);

    const assignmentsByCardIndex = new OIMReactiveIndexManualArrayBased<
        string,
        string
    >(queue);

    const tagsByCardIndex = new OIMReactiveIndexManualArrayBased<
        string,
        string
    >(queue);

    // Users by card assignments (userIds grouped by cardId)
    const usersByAssignedCardIndex = new OIMReactiveIndexManualArrayBased<
        string,
        string
    >(queue);

    const collections = {
        decks: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (deck: Deck) => deck.id },

            indexes: {
                all: new OIMReactiveIndexManualArrayBased<string, string>(
                    queue
                ),
            },
        }),

        cards: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (card: Card) => card.id },

            indexes: { byDeck: cardsByDeckIndex, all: allCardsIndex },
        }),

        comments: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (comment: Comment) => comment.id },

            indexes: { byCard: commentsByCardIndex },
        }),

        users: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (user: User) => user.id },

            indexes: { assignedCardId: usersByAssignedCardIndex },
        }),

        tags: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (tag: Tag) => tag.id },
        }),

        cardAssignments: new OIMRICollection(queue, {
            collectionOpts: {
                selectPk: (assignment: CardAssignment) => assignment.id,
            },

            indexes: { byCard: assignmentsByCardIndex },
        }),

        cardTags: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (cardTag: CardTag) => cardTag.id },

            indexes: {
                byCard: tagsByCardIndex,
            },
        }),

        appState: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (state: AppState) => state.id },

            indexes: {},
        }),
    };

    collections.decks.upsertMany(Object.values(initialData.entities.decks));

    collections.cards.upsertMany(Object.values(initialData.entities.cards));

    collections.comments.upsertMany(
        Object.values(initialData.entities.comments)
    );

    collections.users.upsertMany(Object.values(initialData.entities.users));

    collections.tags.upsertMany(Object.values(initialData.entities.tags));

    collections.cardAssignments.upsertMany(
        Object.values(initialData.entities.cardAssignments)
    );

    collections.cardTags.upsertMany(
        Object.values(initialData.entities.cardTags)
    );

    collections.appState.upsertOne({
        id: 'app',
        activeDeckId: initialData.activeDeckId,
    });

    const groupByKey = <T extends object>(
        entities: T[],

        getKey: (e: T) => string,

        getId: (e: T) => ID
    ): Map<string, ID[]> => {
        const map = new Map<string, ID[]>();

        for (const e of entities) {
            const k = getKey(e);

            if (!map.has(k)) map.set(k, []);

            map.get(k)!.push(getId(e));
        }

        return map;
    };

    collections.decks.indexes.all.addPks(
        'all',

        Object.values(initialData.entities.decks).map(d => d.id)
    );

    const cardsArray = Object.values(initialData.entities.cards);

    allCardsIndex.addPks(
        'all',

        cardsArray.map(c => c.id)
    );

    groupByKey(
        cardsArray,

        c => c.deckId,

        c => c.id
    ).forEach((ids, k) => cardsByDeckIndex.addPks(k, ids));

    groupByKey(
        Object.values(initialData.entities.comments),

        c => c.cardId,

        c => c.id
    ).forEach((ids, k) => commentsByCardIndex.addPks(k, ids));

    const assignmentsArray = Object.values(
        initialData.entities.cardAssignments
    );

    groupByKey(
        assignmentsArray,

        a => a.cardId,

        a => a.id
    ).forEach((ids, k) => assignmentsByCardIndex.addPks(k, ids));

    // Precompute users by assigned card for fast lookup in hooks

    groupByKey(
        assignmentsArray,

        a => a.cardId,

        a => a.userId
    ).forEach((ids, k) => usersByAssignedCardIndex.addPks(k, ids));

    groupByKey(
        Object.values(initialData.entities.cardTags),

        ct => ct.cardId,

        ct => ct.id
    ).forEach((ids, k) => tagsByCardIndex.addPks(k, ids));

    queue.flush();

    collections.decks.indexes.all.addPks(
        'all',
        Object.values(initialData.entities.decks).map(d => d.id)
    );

    return {
        collections,
        decksOrder: initialData.decksOrder,
        queue,
    };
}

// Type for collections from store
type StoreCollections = ReturnType<typeof createOimdbStore>['collections'];

describe('Context and Hooks Type Safety with exact t.ts Collections', () => {
    const initialData: RootState = {
        entities: {
            decks: {
                deck1: {
                    id: 'deck1',
                    name: 'Test Deck',
                    createdAt: Date.now(),
                },
            },
            cards: {
                card1: {
                    id: 'card1',
                    deckId: 'deck1',
                    title: 'Test Card',
                    content: 'Test Content',
                },
            },
            comments: {
                comment1: {
                    id: 'comment1',
                    cardId: 'card1',
                    text: 'Test Comment',
                    createdAt: Date.now(),
                },
            },
            users: {
                user1: {
                    id: 'user1',
                    name: 'Test User',
                    email: 'test@example.com',
                },
            },
            tags: {
                tag1: {
                    id: 'tag1',
                    name: 'Test Tag',
                },
            },
            cardAssignments: {
                assignment1: {
                    id: 'assignment1',
                    cardId: 'card1',
                    userId: 'user1',
                    createdAt: Date.now(),
                },
            },
            cardTags: {
                cardTag1: {
                    id: 'cardTag1',
                    cardId: 'card1',
                    tagId: 'tag1',
                    createdAt: Date.now(),
                },
            },
        },
        activeDeckId: 'deck1',
        decksOrder: ['deck1'],
    };

    test('collections from t.ts should be assignable to CollectionsDictionary', () => {
        const { collections } = createOimdbStore(initialData);

        // This should compile without errors
        const dict: CollectionsDictionary = collections;

        expect(dict).toBe(collections);
        expect(dict.decks).toBe(collections.decks);
        expect(dict.cards).toBe(collections.cards);
    });

    test('should work with typed collections from context', () => {
        const { collections } = createOimdbStore(initialData);

        // Test component that uses context
        const TestComponent: React.FC = () => {
            const typedCollections = useOIMCollectionsContext<StoreCollections>();

            // Test that types are preserved
            const deck = useSelectEntityByPk(typedCollections.decks, 'deck1');
            const card = useSelectEntityByPk(typedCollections.cards, 'card1');
            const comment = useSelectEntityByPk(
                typedCollections.comments,
                'comment1'
            );
            const user = useSelectEntityByPk(typedCollections.users, 'user1');
            const tag = useSelectEntityByPk(typedCollections.tags, 'tag1');
            const appState = useSelectEntityByPk(
                typedCollections.appState,
                'app'
            );

            // Test index access
            const cardsByDeck = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.cards,
                typedCollections.cards.indexes.byDeck,
                'deck1'
            );

            const commentsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.comments,
                typedCollections.comments.indexes.byCard,
                'card1'
            );

            // Test PKs from index
            const cardPks = useSelectPksByIndexKeyArrayBased(
                typedCollections.cards.indexes.byDeck,
                'deck1'
            );

            // Test multiple entities
            const allDecks = useSelectEntitiesByPks(typedCollections.decks, [
                'deck1',
            ]);

            return (
                <div>
                    {deck && <div data-testid="deck">{deck.name}</div>}
                    {card && <div data-testid="card">{card.title}</div>}
                    {comment && (
                        <div data-testid="comment">{comment.text}</div>
                    )}
                    {user && <div data-testid="user">{user.name}</div>}
                    {tag && <div data-testid="tag">{tag.name}</div>}
                    {appState && (
                        <div data-testid="app-state">
                            {appState.activeDeckId}
                        </div>
                    )}
                    <div data-testid="cards-count">
                        {cardsByDeck?.length || 0}
                    </div>
                    <div data-testid="comments-count">
                        {commentsByCard?.length || 0}
                    </div>
                    <div data-testid="card-pks">{cardPks?.join(',') || ''}</div>
                    <div data-testid="all-decks-count">
                        {allDecks?.length || 0}
                    </div>
                </div>
            );
        };

        const { getByTestId } = render(
            <OIMRICollectionsProvider collections={collections}>
                <TestComponent />
            </OIMRICollectionsProvider>
        );

        expect(getByTestId('deck').textContent).toBe('Test Deck');
        expect(getByTestId('card').textContent).toBe('Test Card');
        expect(getByTestId('comment').textContent).toBe('Test Comment');
        expect(getByTestId('user').textContent).toBe('Test User');
        expect(getByTestId('tag').textContent).toBe('Test Tag');
        expect(getByTestId('app-state').textContent).toBe('deck1');
    });

    test('should preserve types when accessing collections properties', () => {
        const { collections } = createOimdbStore(initialData);

        const TestComponent: React.FC = () => {
            const typedCollections = useOIMCollectionsContext<StoreCollections>();

            // TypeScript should infer correct types
            const deck: Deck | undefined = useSelectEntityByPk(
                typedCollections.decks,
                'deck1'
            );
            const card: Card | undefined = useSelectEntityByPk(
                typedCollections.cards,
                'card1'
            );
            const comment: Comment | undefined = useSelectEntityByPk(
                typedCollections.comments,
                'comment1'
            );
            const user: User | undefined = useSelectEntityByPk(
                typedCollections.users,
                'user1'
            );
            const tag: Tag | undefined = useSelectEntityByPk(
                typedCollections.tags,
                'tag1'
            );
            const appState: AppState | undefined = useSelectEntityByPk(
                typedCollections.appState,
                'app'
            );

            // TypeScript should infer array types
            const cards: readonly (Card | undefined)[] | undefined =
                useSelectEntitiesByPks(typedCollections.cards, ['card1']);

            // TypeScript should infer index types
            const cardsByDeck: readonly (Card | undefined)[] | undefined =
                useSelectEntitiesByIndexKeyArrayBased(
                    typedCollections.cards,
                    typedCollections.cards.indexes.byDeck,
                    'deck1'
                );

            return (
                <div>
                    {deck && <div>{deck.name}</div>}
                    {card && <div>{card.title}</div>}
                    {comment && <div>{comment.text}</div>}
                    {user && <div>{user.email}</div>}
                    {tag && <div>{tag.name}</div>}
                    {appState && <div>{appState.activeDeckId}</div>}
                    {cards && <div>{cards.length}</div>}
                    {cardsByDeck && <div>{cardsByDeck.length}</div>}
                </div>
            );
        };

        render(
            <OIMRICollectionsProvider collections={collections}>
                <TestComponent />
            </OIMRICollectionsProvider>
        );
    });

    test('should work with all collection types from t.ts', () => {
        const { collections } = createOimdbStore(initialData);

        const TestComponent: React.FC = () => {
            const typedCollections = useOIMCollectionsContext<StoreCollections>();

            // Test all collections
            const deck = useSelectEntityByPk(typedCollections.decks, 'deck1');
            const card = useSelectEntityByPk(typedCollections.cards, 'card1');
            const comment = useSelectEntityByPk(
                typedCollections.comments,
                'comment1'
            );
            const user = useSelectEntityByPk(typedCollections.users, 'user1');
            const tag = useSelectEntityByPk(typedCollections.tags, 'tag1');
            const assignment = useSelectEntityByPk(
                typedCollections.cardAssignments,
                'assignment1'
            );
            const cardTag = useSelectEntityByPk(
                typedCollections.cardTags,
                'cardTag1'
            );
            const appState = useSelectEntityByPk(
                typedCollections.appState,
                'app'
            );

            // Test indexes
            const cardsByDeck = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.cards,
                typedCollections.cards.indexes.byDeck,
                'deck1'
            );
            const commentsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.comments,
                typedCollections.comments.indexes.byCard,
                'card1'
            );
            const assignmentsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.cardAssignments,
                typedCollections.cardAssignments.indexes.byCard,
                'card1'
            );
            const tagsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.cardTags,
                typedCollections.cardTags.indexes.byCard,
                'card1'
            );
            const usersByAssignedCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.users,
                typedCollections.users.indexes.assignedCardId,
                'card1'
            );

            // Verify types are correct
            expect(deck).toBeDefined();
            expect(card).toBeDefined();
            expect(comment).toBeDefined();
            expect(user).toBeDefined();
            expect(tag).toBeDefined();
            expect(assignment).toBeDefined();
            expect(cardTag).toBeDefined();
            expect(appState).toBeDefined();

            return <div>All collections work</div>;
        };

        render(
            <OIMRICollectionsProvider collections={collections}>
                <TestComponent />
            </OIMRICollectionsProvider>
        );
    });
});

