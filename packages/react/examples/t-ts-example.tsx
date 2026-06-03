/**
 * Example demonstrating type safety with collections from t.ts
 * This file shows how the React context and hooks work with the exact
 * collection structure from packages/core/src/t.ts
 */

import * as React from 'react';
import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMReactiveCollectionIndexManualArrayBased,
} from '@oimdb/core';
import {
    OIMCollectionsProvider,
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
        indexes,
        decksOrder: initialData.decksOrder,
        queue,
    };
}

// Type for collections from store
type StoreCollections = ReturnType<typeof createOimdbStore>['collections'];
type StoreIndexes = ReturnType<typeof createOimdbStore>['indexes'];

// Example component using typed collections
function DeckView({ deckId, indexes }: { deckId: ID; indexes: StoreIndexes }) {
    const { decks, cards } = useOIMCollectionsContext<StoreCollections>();

    // TypeScript correctly infers Deck | undefined
    const deck = useSelectEntityByPk(decks, deckId);

    // TypeScript correctly infers readonly (Card | undefined)[] | undefined
    const deckCards = useSelectEntitiesByIndexKeyArrayBased(
        cards,
        indexes.cards.byDeck,
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
                            <CardComments
                                cardId={card.id}
                                indexes={indexes}
                            />
                        </div>
                    ) : null
                )}
            </div>
        </div>
    );
}

function CardComments({
    cardId,
    indexes,
}: {
    cardId: ID;
    indexes: StoreIndexes;
}) {
    const { comments } = useOIMCollectionsContext<StoreCollections>();

    // TypeScript correctly infers readonly (Comment | undefined)[] | undefined
    const cardComments = useSelectEntitiesByIndexKeyArrayBased(
        comments,
        indexes.comments.byCard,
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

    const { collections, indexes } = React.useMemo(
        () => createOimdbStore(initialData),
        []
    );

    return (
        <OIMCollectionsProvider collections={collections}>
            <DeckView deckId="deck1" indexes={indexes} />
        </OIMCollectionsProvider>
    );
}

export default App;
