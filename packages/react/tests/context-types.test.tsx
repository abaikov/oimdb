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

// Create collections similar to t.ts
function createOimdbStore() {
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

    return { collections, queue };
}

// Type for collections from store
type StoreCollections = ReturnType<typeof createOimdbStore>['collections'];

describe('Context and Hooks Type Safety with t.ts Collections', () => {
    test('should work with typed collections from context', () => {
        const { collections } = createOimdbStore();

        // Add some test data
        collections.decks.upsertOne({
            id: 'deck1',
            name: 'Test Deck',
            createdAt: Date.now(),
        });

        collections.cards.upsertOne({
            id: 'card1',
            deckId: 'deck1',
            title: 'Test Card',
            content: 'Test Content',
        });

        collections.comments.upsertOne({
            id: 'comment1',
            cardId: 'card1',
            text: 'Test Comment',
            createdAt: Date.now(),
        });

        collections.users.upsertOne({
            id: 'user1',
            name: 'Test User',
            email: 'test@example.com',
        });

        collections.tags.upsertOne({
            id: 'tag1',
            name: 'Test Tag',
        });

        collections.appState.upsertOne({
            id: 'app',
            activeDeckId: 'deck1',
        });

        // Test component that uses context
        const TestComponent: React.FC = () => {
            const typedCollections =
                useOIMCollectionsContext<StoreCollections>();

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
                    {comment && <div data-testid="comment">{comment.text}</div>}
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
        const { collections } = createOimdbStore();

        const TestComponent: React.FC = () => {
            const typedCollections =
                useOIMCollectionsContext<StoreCollections>();

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

    test('should work with CollectionsDictionary type', () => {
        const { collections } = createOimdbStore();

        // Collections should be assignable to CollectionsDictionary
        const dict: CollectionsDictionary = collections;

        expect(dict).toBe(collections);
        expect(dict.decks).toBe(collections.decks);
        expect(dict.cards).toBe(collections.cards);
    });
});
