/**
 * Example demonstrating type safety with collections from t.ts
 * This file shows how the React context and hooks work with the exact
 * collection structure from packages/core/src/t.ts
 */

import * as React from 'react';
import {
    OIMEventQueue,
    OIMReactiveIndexManualArrayBased,
    OIMRICollection,
} from '@oimdb/core';
import {
    OIMRICollectionsProvider,
    useOIMCollectionsContext,
} from '../src/context';
import {
    useSelectEntityByPk,
    useSelectEntitiesByIndexKeyArrayBased,
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

// Simplified version of createOimdbStore from t.ts
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
            indexes: { byCard: tagsByCardIndex },
        }),
        appState: new OIMRICollection(queue, {
            collectionOpts: { selectPk: (state: AppState) => state.id },
            indexes: {},
        }),
    };

    // Initialize with data
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

    queue.flush();

    return {
        collections,
        decksOrder: initialData.decksOrder,
        queue,
    };
}

// Type for collections from store
type StoreCollections = ReturnType<typeof createOimdbStore>['collections'];

// Example component using typed collections
function DeckView({ deckId }: { deckId: ID }) {
    const { decks, cards } = useOIMCollectionsContext<StoreCollections>();

    // TypeScript correctly infers Deck | undefined
    const deck = useSelectEntityByPk(decks, deckId);

    // TypeScript correctly infers readonly (Card | undefined)[] | undefined
    const deckCards = useSelectEntitiesByIndexKeyArrayBased(
        cards,
        cards.indexes.byDeck,
        deckId
    );

    if (!deck) {
        return <div>Deck not found</div>;
    }

    return (
        <div>
            <h2>{deck.name}</h2>
            <div>
                {deckCards?.map(card =>
                    card ? (
                        <div key={card.id}>
                            <h3>{card.title}</h3>
                            <p>{card.content}</p>
                            <CardComments cardId={card.id} />
                        </div>
                    ) : null
                )}
            </div>
        </div>
    );
}

function CardComments({ cardId }: { cardId: ID }) {
    const { comments } = useOIMCollectionsContext<StoreCollections>();

    // TypeScript correctly infers readonly (Comment | undefined)[] | undefined
    const cardComments = useSelectEntitiesByIndexKeyArrayBased(
        comments,
        comments.indexes.byCard,
        cardId
    );

    return (
        <div>
            <h4>Comments:</h4>
            {cardComments?.map(comment =>
                comment ? <div key={comment.id}>{comment.text}</div> : null
            )}
        </div>
    );
}

function App() {
    const initialData: RootState = {
        entities: {
            decks: {
                deck1: {
                    id: 'deck1',
                    name: 'My First Deck',
                    createdAt: Date.now(),
                },
            },
            cards: {
                card1: {
                    id: 'card1',
                    deckId: 'deck1',
                    title: 'First Card',
                    content: 'This is my first card',
                },
            },
            comments: {
                comment1: {
                    id: 'comment1',
                    cardId: 'card1',
                    text: 'Great card!',
                    createdAt: Date.now(),
                },
            },
            users: {},
            tags: {},
            cardAssignments: {},
            cardTags: {},
        },
        activeDeckId: 'deck1',
        decksOrder: ['deck1'],
    };

    const { collections } = React.useMemo(
        () => createOimdbStore(initialData),
        []
    );

    return (
        <OIMRICollectionsProvider collections={collections}>
            <DeckView deckId="deck1" />
        </OIMRICollectionsProvider>
    );
}

export default App;
