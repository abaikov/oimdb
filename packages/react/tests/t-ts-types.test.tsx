import * as React from 'react';
import { render } from '@testing-library/react';
import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
} from '@oimdb/core';
import {
    OIMCollectionsProvider,
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

    const collections = {
        decks: new OIMReactiveCollection<Deck, string>(queue, {
            selectPk: (deck: Deck) => deck.id,
        }),

        cards: new OIMReactiveCollection<Card, string>(queue, {
            selectPk: (card: Card) => card.id,
        }),

        comments: new OIMReactiveCollection<Comment, string>(queue, {
            selectPk: (comment: Comment) => comment.id,
        }),

        users: new OIMReactiveCollection<User, string>(queue, {
            selectPk: (user: User) => user.id,
        }),

        tags: new OIMReactiveCollection<Tag, string>(queue, {
            selectPk: (tag: Tag) => tag.id,
        }),

        cardAssignments: new OIMReactiveCollection<CardAssignment, string>(
            queue,
            {
                selectPk: (assignment: CardAssignment) => assignment.id,
            }
        ),

        cardTags: new OIMReactiveCollection<CardTag, string>(queue, {
            selectPk: (cardTag: CardTag) => cardTag.id,
        }),

        appState: new OIMReactiveCollection<AppState, string>(queue, {
            selectPk: (state: AppState) => state.id,
        }),
    };

    const indexes = {
        decks: {
            all: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                Deck
            >(queue, { collection: collections.decks }),
        },
        cards: {
            byDeck: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                Card
            >(queue, { collection: collections.cards }),
            all: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                Card
            >(queue, { collection: collections.cards }),
        },
        comments: {
            byCard: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                Comment
            >(queue, { collection: collections.comments }),
        },
        users: {
            assignedCardId: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                User
            >(queue, { collection: collections.users }),
        },
        cardAssignments: {
            byCard: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                CardAssignment
            >(queue, { collection: collections.cardAssignments }),
        },
        cardTags: {
            byCard: new OIMReactiveCollectionIndexManualArrayBased<
                string,
                string,
                CardTag
            >(queue, { collection: collections.cardTags }),
        },
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

    indexes.decks.all.addPks(
        'all',

        Object.values(initialData.entities.decks).map(d => d.id)
    );

    const cardsArray = Object.values(initialData.entities.cards);

    indexes.cards.all.addPks(
        'all',

        cardsArray.map(c => c.id)
    );

    groupByKey(
        cardsArray,

        c => c.deckId,

        c => c.id
    ).forEach((ids, k) => indexes.cards.byDeck.addPks(k, ids));

    groupByKey(
        Object.values(initialData.entities.comments),

        c => c.cardId,

        c => c.id
    ).forEach((ids, k) => indexes.comments.byCard.addPks(k, ids));

    const assignmentsArray = Object.values(
        initialData.entities.cardAssignments
    );

    groupByKey(
        assignmentsArray,

        a => a.cardId,

        a => a.id
    ).forEach((ids, k) => indexes.cardAssignments.byCard.addPks(k, ids));

    // Precompute users by assigned card for fast lookup in hooks

    groupByKey(
        assignmentsArray,

        a => a.cardId,

        a => a.userId
    ).forEach((ids, k) => indexes.users.assignedCardId.addPks(k, ids));

    groupByKey(
        Object.values(initialData.entities.cardTags),

        ct => ct.cardId,

        ct => ct.id
    ).forEach((ids, k) => indexes.cardTags.byCard.addPks(k, ids));

    queue.flush();

    indexes.decks.all.addPks(
        'all',
        Object.values(initialData.entities.decks).map(d => d.id)
    );

    return {
        collections,
        indexes,
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
        const { collections, indexes } = createOimdbStore(initialData);

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
                indexes.cards.byDeck,
                'deck1'
            );

            const commentsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.comments,
                indexes.comments.byCard,
                'card1'
            );

            // Test PKs from index
            const cardPks = useSelectPksByIndexKeyArrayBased(
                indexes.cards.byDeck,
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
            <OIMCollectionsProvider collections={collections}>
                <TestComponent />
            </OIMCollectionsProvider>
        );

        expect(getByTestId('deck').textContent).toBe('Test Deck');
        expect(getByTestId('card').textContent).toBe('Test Card');
        expect(getByTestId('comment').textContent).toBe('Test Comment');
        expect(getByTestId('user').textContent).toBe('Test User');
        expect(getByTestId('tag').textContent).toBe('Test Tag');
        expect(getByTestId('app-state').textContent).toBe('deck1');
    });

    test('should preserve types when accessing collections properties', () => {
        const { collections, indexes } = createOimdbStore(initialData);

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
                    indexes.cards.byDeck,
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
            <OIMCollectionsProvider collections={collections}>
                <TestComponent />
            </OIMCollectionsProvider>
        );
    });

    test('should work with all collection types from t.ts', () => {
        const { collections, indexes } = createOimdbStore(initialData);

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
                indexes.cards.byDeck,
                'deck1'
            );
            const commentsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.comments,
                indexes.comments.byCard,
                'card1'
            );
            const assignmentsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.cardAssignments,
                indexes.cardAssignments.byCard,
                'card1'
            );
            const tagsByCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.cardTags,
                indexes.cardTags.byCard,
                'card1'
            );
            const usersByAssignedCard = useSelectEntitiesByIndexKeyArrayBased(
                typedCollections.users,
                indexes.users.assignedCardId,
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
            <OIMCollectionsProvider collections={collections}>
                <TestComponent />
            </OIMCollectionsProvider>
        );
    });
});

