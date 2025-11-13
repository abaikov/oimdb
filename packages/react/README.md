# @oimdb/react

React integration for OIMDB - Hooks for selection and subscription with reactive collections and indexes.

## Overview

`@oimdb/react` provides React hooks that work with OIMDB reactive objects (`OIMReactiveCollection` and `OIMReactiveIndex`). The library includes both direct hooks for component-level usage and React Context utilities for application-wide data management.

## Features

- **Reactive Integration**: Hooks work with `OIMReactiveCollection` and reactive indexes from `@oimdb/core`
- **Index Type Support**: Separate hooks for SetBased indexes (return `Set<TPk>`) and ArrayBased indexes (return `TPk[]`)
- **Automatic Subscription**: Uses `useSyncExternalStore` for optimal React 18+ performance
- **Event Coalescing**: Leverages OIMDB's built-in event coalescing for efficient updates
- **Type Safety**: Full TypeScript support with advanced generic type inference
- **Context Support**: Optional React Context for centralized collection management
- **Flexible Usage**: Use hooks directly or through context provider pattern

## Installation

```bash
npm install @oimdb/react @oimdb/core
```

## Usage

### Basic Setup

```typescript
import { 
  OIMEventQueue, 
  OIMRICollection, 
  OIMReactiveIndexManualSetBased,
  OIMReactiveIndexManualArrayBased 
} from '@oimdb/core';
import { 
  useSelectEntitiesByPks, 
  useSelectEntitiesByIndexKeySetBased,
  useSelectEntitiesByIndexKeyArrayBased,
  useSelectEntityByPk 
} from '@oimdb/react';

// Create event queue and reactive collections
const queue = new OIMEventQueue();

// Choose index type based on your needs:
// - SetBased: for frequent add/remove operations, order doesn't matter
// - ArrayBased: for full replacements or when order/sorting matters
const userTeamIndex = new OIMReactiveIndexManualSetBased<string, string>(queue);
const deckCardsIndex = new OIMReactiveIndexManualArrayBased<string, string>(queue);

const usersCollection = new OIMRICollection(queue, {
  collectionOpts: { selectPk: (user: User) => user.id },
  indexes: { byTeam: userTeamIndex },
});
```

### Single Entity Selection

```typescript
function UserProfile({ userId }: { userId: string }) {
  const user = useSelectEntityByPk(usersCollection, userId);

  if (!user) return <div>Loading...</div>;

  return (
    <div>
      <h2>{user.name}</h2>
      <p>Email: {user.email}</p>
    </div>
  );
}
```

### Multiple Entities Selection

```typescript
function UserList({ userIds }: { userIds: string[] }) {
  const users = useSelectEntitiesByPks(usersCollection, userIds);

  return (
    <ul>
      {users.map((user, index) => (
        <li key={user?.id || index}>
          {user ? user.name : 'Loading...'}
        </li>
      ))}
    </ul>
  );
}
```

### Index-based Selection

OIMDB provides separate hooks for SetBased and ArrayBased indexes:

#### SetBased Indexes (returns Set)

```typescript
import { useSelectEntitiesByIndexKeySetBased, useSelectPksByIndexKeySetBased } from '@oimdb/react';

function TeamMembers({ teamId }: { teamId: string }) {
  // For SetBased indexes, use SetBased hooks
  const teamUsers = useSelectEntitiesByIndexKeySetBased(
    usersCollection,
    usersCollection.indexes.byTeam, // OIMReactiveIndexManualSetBased
    teamId
  );

  // Or get just the PKs as Set
  const teamUserIds = useSelectPksByIndexKeySetBased(
    usersCollection.indexes.byTeam,
    teamId
  ); // Returns Set<string>

  return (
    <div>
      {teamUsers.map((user, index) => (
        <div key={user?.id || index}>
          {user ? `${user.name} (${user.role})` : 'Loading...'}
        </div>
      ))}
    </div>
  );
}
```

#### ArrayBased Indexes (returns Array)

```typescript
import { useSelectEntitiesByIndexKeyArrayBased, useSelectPksByIndexKeyArrayBased } from '@oimdb/react';

function DeckCards({ deckId }: { deckId: string }) {
  // For ArrayBased indexes, use ArrayBased hooks
  const cards = useSelectEntitiesByIndexKeyArrayBased(
    cardsCollection,
    cardsCollection.indexes.byDeck, // OIMReactiveIndexManualArrayBased
    deckId
  );

  // Or get just the PKs as Array (preserves order)
  const cardIds = useSelectPksByIndexKeyArrayBased(
    cardsCollection.indexes.byDeck,
    deckId
  ); // Returns string[] (preserves order/sorting)

  return (
    <div>
      {cards.map((card, index) => (
        <div key={card?.id || index}>
          {card ? `${index + 1}. ${card.name}` : 'Loading...'}
        </div>
      ))}
    </div>
  );
}
```

## React Context Integration

For applications with multiple collections, use the React Context pattern for centralized management:

### Context Setup

```typescript
import { 
  OIMRICollectionsProvider, 
  useOIMCollectionsContext
} from '@oimdb/react';

interface User {
  id: string;
  name: string;
  teamId: string;
}

interface Team {
  id: string;
  name: string;
}

function createCollections() {
  const queue = new OIMEventQueue();
  
  // Use SetBased for frequent add/remove operations
  const userTeamIndex = new OIMReactiveIndexManualSetBased<string, string>(queue);
  const usersCollection = new OIMRICollection(queue, {
    collectionOpts: { selectPk: (user: User) => user.id },
    indexes: { byTeam: userTeamIndex },
  });
  
  const teamsCollection = new OIMRICollection(queue, {
    collectionOpts: { selectPk: (team: Team) => team.id },
    indexes: {},
  });
  
  return { users: usersCollection, teams: teamsCollection } as const;
}

type AppCollections = ReturnType<typeof createCollections>;
```

## TypeScript Typing Strategies

For maximum type safety, you should properly type your collections dictionary. There are two main approaches, similar to how Redux handles state typing:

### Approach 1: Using `typeof` (Recommended for Simple Cases)

The simplest approach is to use TypeScript's `typeof` operator to infer types from your collection instances:

```typescript
import { OIMEventQueue, OIMRICollection, OIMReactiveIndexManual } from '@oimdb/core';

interface User {
  id: string;
  name: string;
  teamId: string;
}

interface Team {
  id: string;
  name: string;
}

// Create collections
const queue = new OIMEventQueue();
const userTeamIndex = new OIMReactiveIndexManualSetBased<string, string>(queue);
const usersCollection = new OIMRICollection(queue, {
  collectionOpts: { selectPk: (user: User) => user.id },
  indexes: { byTeam: userTeamIndex },
});

const teamsCollection = new OIMRICollection(queue, {
  collectionOpts: { selectPk: (team: Team) => team.id },
  indexes: {},
});

// Infer types using typeof
const collections = {
  users: usersCollection,
  teams: teamsCollection,
} as const;

// Extract the type
type AppCollections = typeof collections;
```

**Usage:**
```typescript
function MyComponent() {
  const { users, teams } = useOIMCollectionsContext<AppCollections>();
  // users and teams are fully typed with all their generics preserved
}
```

### Approach 2: Creating Explicit Types (Recommended for Complex Projects)

For larger applications or when you need more control, create explicit type definitions similar to Redux's approach:

```typescript
import { 
  OIMEventQueue, 
  OIMRICollection, 
  OIMReactiveIndexManualSetBased 
} from '@oimdb/core';
import type { 
  TOIMPk, 
  OIMIndexSetBased, 
  OIMReactiveIndexSetBased 
} from '@oimdb/core';

interface User {
  id: string;
  name: string;
  teamId: string;
}

interface Team {
  id: string;
  name: string;
}

// Define your collection types explicitly
type UserCollection = OIMRICollection<
  User,
  string,
  'byTeam',
  string,
  OIMIndexSetBased<string, string>,
  OIMReactiveIndexSetBased<string, string, OIMIndexSetBased<string, string>>
>;

type TeamCollection = OIMRICollection<
  Team,
  string,
  never,
  never,
  OIMIndexSetBased<never, never>,
  OIMReactiveIndexSetBased<never, never, OIMIndexSetBased<never, never>>
>;

// Define your collections dictionary type
interface AppCollections {
  users: UserCollection;
  teams: TeamCollection;
}

// Factory function that returns properly typed collections
function createCollections(): AppCollections {
  const queue = new OIMEventQueue();
  const userTeamIndex = new OIMReactiveIndexManualSetBased<string, string>(queue);
  
  return {
    users: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (user: User) => user.id },
      indexes: { byTeam: userTeamIndex },
    }) as UserCollection,
    
    teams: new OIMRICollection(queue, {
      collectionOpts: { selectPk: (team: Team) => team.id },
      indexes: {},
    }) as TeamCollection,
  };
}
```

**Usage:**
```typescript
function MyComponent() {
  const { users, teams } = useOIMCollectionsContext<AppCollections>();
  // Full type safety with explicit types
}
```

### When to Use Each Approach

- **Use `typeof`** when:
  - You have simple collection setups
  - You want TypeScript to infer everything automatically
  - You prefer less boilerplate
  - Your collections are created in one place

- **Use explicit types** when:
  - You need to share types across multiple files
  - You want to document your data structure explicitly
  - You're building a library or shared module
  - You need to ensure type consistency across your application
  - You prefer Redux-style explicit typing patterns

### Provider Setup

```typescript
function App() {
  const collections = React.useMemo(() => createCollections(), []);
  
  return (
    <OIMRICollectionsProvider collections={collections}>
      <UserDashboard />
    </OIMRICollectionsProvider>
  );
}
```

### Using Context in Components

```typescript
function UserDashboard() {
  const { users, teams } = useOIMCollectionsContext<AppCollections>();
  
  // Use collections with hooks
  const allUsers = useSelectEntitiesByPks(users, []);
  // Use appropriate hook based on index type
  const teamMembers = useSelectEntitiesByIndexKeySetBased(
    users,
    users.indexes.byTeam, // SetBased index
    'team1'
  );
  
  return (
    <div>
      <h2>All Users: {allUsers.length}</h2>
      <h3>Team 1 Members: {teamMembers.length}</h3>
    </div>
  );
}
```

### Custom Context

For multiple independent contexts:

```typescript
const UserContext = createOIMCollectionsContext<{ users: typeof usersCollection }>();

function UserProvider({ children }: { children: React.ReactNode }) {
  const collections = React.useMemo(() => ({ users: usersCollection }), []);
  
  return (
    <OIMRICollectionsProvider collections={collections} context={UserContext}>
      {children}
    </OIMRICollectionsProvider>
  );
}

function UserComponent() {
  const { users } = useOIMCollectionsContext(UserContext);
  // Use users collection...
}
```

## API Reference

### `useSelectEntityByPk(reactiveCollection, pk)`

Subscribes to a single entity from a reactive collection.

**Parameters:**
- `reactiveCollection: OIMReactiveCollection<TEntity, TPk>` - Reactive collection instance
- `pk: TPk` - Primary key of the entity

**Returns:**
- `TEntity | undefined` - Entity data or undefined if not found

### `useSelectEntitiesByPks(reactiveCollection, pks)`

Subscribes to multiple entities from a reactive collection.

**Parameters:**
- `reactiveCollection: OIMReactiveCollection<TEntity, TPk>` - Reactive collection instance
- `pks: readonly TPk[]` - Array of primary keys

**Returns:**
- `(TEntity | undefined)[]` - Array of entities (undefined for missing entities)

### Index-based Selection Hooks

OIMDB provides separate hooks for SetBased and ArrayBased indexes to ensure type safety and correct return types.

#### SetBased Index Hooks

##### `useSelectEntitiesByIndexKeySetBased(reactiveCollection, reactiveIndex, key)`

Subscribes to entities indexed by a specific key from a SetBased index.

**Parameters:**
- `reactiveCollection: OIMReactiveCollection<TEntity, TPk>` - Reactive collection instance
- `reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>` - SetBased reactive index instance
- `key: TKey` - Index key to query

**Returns:**
- `(TEntity | undefined)[]` - Array of entities for the given index key

##### `useSelectEntitiesByIndexKeysSetBased(reactiveCollection, reactiveIndex, keys)`

Subscribes to entities indexed by multiple keys from a SetBased index.

**Parameters:**
- `reactiveCollection: OIMReactiveCollection<TEntity, TPk>` - Reactive collection instance
- `reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>` - SetBased reactive index instance
- `keys: readonly TKey[]` - Array of index keys to query

**Returns:**
- `(TEntity | undefined)[]` - Array of entities for the given index keys

##### `useSelectPksByIndexKeySetBased(reactiveIndex, key)`

Subscribes to primary keys indexed by a specific key from a SetBased index.

**Parameters:**
- `reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>` - SetBased reactive index instance
- `key: TKey` - Index key to query

**Returns:**
- `Set<TPk>` - Set of primary keys for the given index key

##### `useSelectPksByIndexKeysSetBased(reactiveIndex, keys)`

Subscribes to primary keys indexed by multiple keys from a SetBased index.

**Parameters:**
- `reactiveIndex: OIMReactiveIndexSetBased<TKey, TPk, TIndex>` - SetBased reactive index instance
- `keys: readonly TKey[]` - Array of index keys to query

**Returns:**
- `Map<TKey, Set<TPk>>` - Map of index keys to their corresponding primary key Sets

#### ArrayBased Index Hooks

##### `useSelectEntitiesByIndexKeyArrayBased(reactiveCollection, reactiveIndex, key)`

Subscribes to entities indexed by a specific key from an ArrayBased index.

**Parameters:**
- `reactiveCollection: OIMReactiveCollection<TEntity, TPk>` - Reactive collection instance
- `reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>` - ArrayBased reactive index instance
- `key: TKey` - Index key to query

**Returns:**
- `(TEntity | undefined)[]` - Array of entities for the given index key (preserves order)

##### `useSelectEntitiesByIndexKeysArrayBased(reactiveCollection, reactiveIndex, keys)`

Subscribes to entities indexed by multiple keys from an ArrayBased index.

**Parameters:**
- `reactiveCollection: OIMReactiveCollection<TEntity, TPk>` - Reactive collection instance
- `reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>` - ArrayBased reactive index instance
- `keys: readonly TKey[]` - Array of index keys to query

**Returns:**
- `(TEntity | undefined)[]` - Array of entities for the given index keys (preserves order)

##### `useSelectPksByIndexKeyArrayBased(reactiveIndex, key)`

Subscribes to primary keys indexed by a specific key from an ArrayBased index.

**Parameters:**
- `reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>` - ArrayBased reactive index instance
- `key: TKey` - Index key to query

**Returns:**
- `TPk[]` - Array of primary keys for the given index key (preserves order/sorting)

##### `useSelectPksByIndexKeysArrayBased(reactiveIndex, keys)`

Subscribes to primary keys indexed by multiple keys from an ArrayBased index.

**Parameters:**
- `reactiveIndex: OIMReactiveIndexArrayBased<TKey, TPk, TIndex>` - ArrayBased reactive index instance
- `keys: readonly TKey[]` - Array of index keys to query

**Returns:**
- `Map<TKey, TPk[]>` - Map of index keys to their corresponding primary key arrays (preserves order)

## Context API Reference

### `OIMRICollectionsProvider<T>`

Provider component for collections context.

**Props:**
- `collections: T` - Dictionary of reactive collections
- `children: ReactNode` - React children
- `context?: React.Context<OIMContextValue<T>>` - Optional custom context

### `useOIMCollectionsContext<T>(context?)`

Hook to access collections from context.

**Parameters:**
- `context?: React.Context<OIMContextValue<T>>` - Optional custom context

**Returns:**
- `T` - Collections dictionary with full type safety

**Throws:**
- Error if used outside of provider

### `createOIMCollectionsContext<T>()`

Creates a custom collections context with specific typing.

**Returns:**
- `React.Context<OIMContextValue<T>>` - Typed React context

### Type Utilities

#### `CollectionsDictionary`

Base type for any collections dictionary. Use `typeof` to extract types from your collection instances, or define explicit types using `OIMRICollection` generics.

## Architecture

### Reactive Collections Integration

The hooks work directly with OIMDB reactive objects:

```typescript
// Use reactive collections and indexes directly
const user = useSelectEntityByPk(reactiveCollection, 'user123');

// Use appropriate hook based on index type
const posts = useSelectEntitiesByIndexKeySetBased(
  reactiveCollection, 
  reactiveIndexSetBased, // SetBased index
  'tech'
);

const orderedCards = useSelectEntitiesByIndexKeyArrayBased(
  reactiveCollection,
  reactiveIndexArrayBased, // ArrayBased index
  'deck1'
);
```

### Event Subscription

Hooks automatically subscribe to OIMDB reactive events using `useSyncExternalStore`:

- **Collection updates**: Subscribe to `reactiveCollection.updateEventEmitter`
- **Index updates**: Subscribe to `reactiveIndex.updateEventEmitter`
- **Optimized subscriptions**: Subscribe only to specific keys for efficient updates
- **Automatic cleanup**: Unsubscribe when component unmounts

### Index Type Selection

When working with indexes, choose the appropriate hook based on your index type:

- **SetBased indexes** (`OIMReactiveIndexManualSetBased`): Use `*SetBased` hooks (e.g., `useSelectPksByIndexKeySetBased`) - returns `Set<TPk>`
- **ArrayBased indexes** (`OIMReactiveIndexManualArrayBased`): Use `*ArrayBased` hooks (e.g., `useSelectPksByIndexKeyArrayBased`) - returns `TPk[]` (preserves order)

This ensures type safety and correct return types. TypeScript will enforce the correct hook usage based on your index type.

### Performance

- **React 18+ Integration**: Uses `useSyncExternalStore` for optimal performance
- **Event Coalescing**: OIMDB's built-in event coalescing reduces unnecessary re-renders
- **Key-specific subscriptions**: Only listen to changes for relevant data
- **Memory Management**: Automatic cleanup prevents memory leaks
- **Efficient batching**: Updates are batched through React's concurrent features

## Examples

### Complete Example

```typescript
import React from 'react';
import { 
  OIMEventQueue, 
  OIMRICollection, 
  OIMReactiveIndexManualSetBased,
  OIMReactiveIndexManualArrayBased 
} from '@oimdb/core';
import { 
  useSelectEntityByPk, 
  useSelectEntitiesByPks, 
  useSelectEntitiesByIndexKeySetBased,
  useSelectEntitiesByIndexKeyArrayBased 
} from '@oimdb/react';

interface User {
  id: string;
  name: string;
  email: string;
  teamId: string;
}

// Setup
function createUserCollection() {
  const queue = new OIMEventQueue();
  // Use SetBased for frequent add/remove operations
  const teamIndex = new OIMReactiveIndexManualSetBased<string, string>(queue);
  
  return new OIMRICollection(queue, {
    collectionOpts: { selectPk: (user: User) => user.id },
    indexes: { byTeam: teamIndex },
  });
}

const usersCollection = createUserCollection();

// Component
function UserProfile({ userId }: { userId: string }) {
  const user = useSelectEntityByPk(usersCollection, userId);
  
  if (!user) return <div>Loading...</div>;
  
  return <h2>{user.name}</h2>;
}

function TeamDashboard({ teamId }: { teamId: string }) {
  // Use SetBased hook for SetBased index
  const teamMembers = useSelectEntitiesByIndexKeySetBased(
    usersCollection,
    usersCollection.indexes.byTeam, // OIMReactiveIndexManualSetBased
    teamId
  );
  
  return (
    <div>
      <h3>Team Members ({teamMembers.length})</h3>
      {teamMembers.map(user => (
        <div key={user?.id}>{user?.name}</div>
      ))}
    </div>
  );
}
```

### With Context Provider

```typescript
import { 
  OIMRICollectionsProvider, 
  useOIMCollectionsContext 
} from '@oimdb/react';

function App() {
  const collections = React.useMemo(() => ({
    users: createUserCollection(),
    // ... other collections
  }), []);
  
  return (
    <OIMRICollectionsProvider collections={collections}>
      <Dashboard />
    </OIMRICollectionsProvider>
  );
}

function Dashboard() {
  const { users } = useOIMCollectionsContext();
  const allUsers = useSelectEntitiesByPks(users, []);
  
  return <div>Total Users: {allUsers.length}</div>;
}
```

## Migration from v0.x

The v1.x API has changed significantly to work with reactive collections:

### Hook Name Changes

```typescript
// v0.x - Abstract storage interfaces
const user = useEntity(userStorage, 'user123');
const users = useEntities(userStorage, userIds);
const posts = useIndex(postStorage, categoryIndex, 'tech');

// v1.x - Reactive collections with typed indexes
const user = useSelectEntityByPk(reactiveCollection, 'user123');
const users = useSelectEntitiesByPks(reactiveCollection, userIds);
// Use appropriate hook based on index type
const posts = useSelectEntitiesByIndexKeySetBased(
  reactiveCollection, 
  reactiveIndexSetBased, 
  'tech'
);
const orderedItems = useSelectEntitiesByIndexKeyArrayBased(
  reactiveCollection,
  reactiveIndexArrayBased,
  'category1'
);
```

### Collection Creation

```typescript
// v0.x - With DX layer
const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();
const user = useEntity(users.advanced.collection, userId);

// v1.x - Direct reactive collections
const queue = new OIMEventQueue();
const usersCollection = new OIMRICollection(queue, {
  collectionOpts: { selectPk: (user: User) => user.id },
  indexes: {},
});
const user = useSelectEntityByPk(usersCollection, userId);
```

### Context API

```typescript
// v0.x - No context support

// v1.x - Full context support
const collections = { users: usersCollection };
<OIMRICollectionsProvider collections={collections}>
  <App />
</OIMRICollectionsProvider>
```

### Key Changes

- **Hook naming**: More explicit names like `useSelectEntityByPk` vs `useEntity`
- **Parameters**: Direct reactive collection objects instead of storage abstractions
- **Context**: New context API for centralized collection management
- **Type safety**: Enhanced TypeScript support with better inference

## Dependencies

- `@oimdb/core` - Core OIMDB functionality
- `react` - React hooks and components

## License

MIT
