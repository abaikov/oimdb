# OIMDB Migration Guide

This guide helps you migrate from other state management solutions to OIMDB.

> **Note**: This guide uses `useExternalStore` (React 18+) for React integration examples. If you're using React 17 or earlier, you can use the traditional `useState` + `useEffect` pattern shown in the [API documentation](API.md).

## Migration from Redux

### Before (Redux)

```typescript
// Redux store setup
import { createStore, combineReducers } from 'redux';

const userReducer = (state = {}, action) => {
    switch (action.type) {
        case 'ADD_USER':
            return { ...state, [action.payload.id]: action.payload };
        case 'UPDATE_USER':
            return { ...state, [action.payload.id]: { ...state[action.payload.id], ...action.payload } };
        case 'REMOVE_USER':
            const { [action.payload]: removed, ...rest } = state;
            return rest;
        default:
            return state;
    }
};

const store = createStore(combineReducers({ users: userReducer }));

// Component usage
const mapStateToProps = (state) => ({
    users: Object.values(state.users)
});

const mapDispatchToProps = (dispatch) => ({
    addUser: (user) => dispatch({ type: 'ADD_USER', payload: user }),
    updateUser: (user) => dispatch({ type: 'UPDATE_USER', payload: user }),
    removeUser: (id) => dispatch({ type: 'REMOVE_USER', payload: id })
});
```

### After (OIMDB)

```typescript
// OIMDB setup
import { createDb } from 'oimdb/dx';

const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();

// Component usage with React hooks
import { useState, useEffect } from 'react';

function UserList() {
    const [userList, setUserList] = useState<User[]>([]);
    
    useEffect(() => {
        // Subscribe to all user updates
        const unsubscribe = users.subscribeMany(
            users.advanced.collection.keys(),
            () => {
                setUserList(users.advanced.collection.values());
            }
        );
        
        // Initial load
        setUserList(users.advanced.collection.values());
        
        return unsubscribe;
    }, []);
    
    const addUser = (user: User) => users.upsert(user);
    const updateUser = (user: User) => users.upsert(user);
    const removeUser = (id: string) => users.remove({ id });
    
    return (
        <div>
            {userList.map(user => (
                <UserItem key={user.id} user={user} onUpdate={updateUser} onDelete={removeUser} />
            ))}
        </div>
    );
}
```

### Key Differences

| Redux | OIMDB |
|-------|-------|
| Action creators and reducers | Direct method calls |
| Immutable state updates | Mutable in-place updates |
| Selectors for derived state | Indexes for fast lookups |
| Middleware for side effects | Event system for reactivity |
| Store subscription | Entity-level subscriptions |
| `connect()` HOC | `useExternalStore` hook (React 18+) |

## Migration from Zustand

### Before (Zustand)

```typescript
import create from 'zustand';

interface UserStore {
    users: Record<string, User>;
    addUser: (user: User) => void;
    updateUser: (user: User) => void;
    removeUser: (id: string) => void;
    getUser: (id: string) => User | undefined;
}

const useUserStore = create<UserStore>((set, get) => ({
    users: {},
    addUser: (user) => set((state) => ({
        users: { ...state.users, [user.id]: user }
    })),
    updateUser: (user) => set((state) => ({
        users: { ...state.users, [user.id]: { ...state.users[user.id], ...user } }
    })),
    removeUser: (id) => set((state) => {
        const { [id]: removed, ...rest } = state.users;
        return { users: rest };
    }),
    getUser: (id) => get().users[id]
}));

// Component usage
function UserProfile({ userId }: { userId: string }) {
    const user = useUserStore((state) => state.getUser(userId));
    const updateUser = useUserStore((state) => state.updateUser);
    
    return (
        <div>
            <h1>{user?.name}</h1>
            <button onClick={() => updateUser({ ...user, name: 'New Name' })}>
                Update Name
            </button>
        </div>
    );
}
```

### After (OIMDB)

```typescript
import { createDb } from 'oimdb/dx';
import { useExternalStore } from 'react';

const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();

// Component usage with useExternalStore (React 18+)
function UserProfile({ userId }: { userId: string }) {
    const user = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.get(userId)
    );
    
    const updateUser = (updates: Partial<User>) => {
        if (user) {
            users.upsert({ ...user, ...updates });
        }
    };
    
    if (!user) return <div>Loading...</div>;
    
    return (
        <div>
            <h1>{user.name}</h1>
            <button onClick={() => updateUser({ name: 'New Name' })}>
                Update Name
            </button>
        </div>
    );
}
```

### Key Differences

| Zustand | OIMDB |
|---------|-------|
| Single store with slices | Multiple collections |
| Immer-style updates | Direct mutations with events |
| Store-level subscriptions | Entity-level subscriptions |
| Computed values | Index-based queries |
| `useStore()` hook | `useExternalStore` hook (React 18+) |

## Migration from MobX

### Before (MobX)

```typescript
import { makeAutoObservable, runInAction } from 'mobx';

class UserStore {
    users = new Map<string, User>();
    
    constructor() {
        makeAutoObservable(this);
    }
    
    addUser(user: User) {
        this.users.set(user.id, user);
    }
    
    updateUser(user: User) {
        const existing = this.users.get(user.id);
        if (existing) {
            Object.assign(existing, user);
        }
    }
    
    removeUser(id: string) {
        this.users.delete(id);
    }
    
    get usersList() {
        return Array.from(this.users.values());
    }
}

const userStore = new UserStore();

// Component usage with MobX React
import { observer } from 'mobx-react-lite';

const UserList = observer(() => {
    return (
        <div>
            {userStore.usersList.map(user => (
                <UserItem key={user.id} user={user} />
            ))}
        </div>
    );
});
```

### After (OIMDB)

```typescript
import { createDb } from 'oimdb/dx';
import { useExternalStore } from 'react';

const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();

// Component usage with useExternalStore (React 18+)
function UserList() {
    const userList = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.values()
    );
    
    return (
        <div>
            {userList.map(user => (
                <UserItem key={user.id} user={user} />
            ))}
        </div>
    );
}
```

### Key Differences

| MobX | OIMDB |
|------|-------|
| Observable objects | Event-driven updates |
| Computed values | Index-based queries |
| Actions and reactions | Direct method calls with events |
| MobX React integration | `useExternalStore` hook (React 18+) |

## Migration from Apollo Client (GraphQL)

### Before (Apollo Client)

```typescript
import { useQuery, useMutation, gql } from '@apollo/client';

const GET_USERS = gql`
    query GetUsers {
        users {
            id
            name
            email
            posts {
                id
                title
            }
        }
    }
`;

const UPDATE_USER = gql`
    mutation UpdateUser($id: ID!, $name: String!) {
        updateUser(id: $id, name: $name) {
            id
            name
        }
    }
`;

function UserList() {
    const { data, loading, error } = useQuery(GET_USERS);
    const [updateUser] = useMutation(UPDATE_USER);
    
    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;
    
    return (
        <div>
            {data.users.map(user => (
                <UserItem 
                    key={user.id} 
                    user={user}
                    onUpdate={(name) => updateUser({ variables: { id: user.id, name } })}
                />
            ))}
        </div>
    );
}
```

### After (OIMDB)

```typescript
import { createDb } from 'oimdb/dx';

const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();
const posts = db.createCollection<Post>();
const userPostsIndex = db.createIndex<string, string>();

// Load data from API
useEffect(() => {
    async function loadUsers() {
        const response = await fetch('/api/users');
        const userData = await response.json();
        
        // Normalize and store data
        users.upsertMany(userData.users);
        
        // Build indexes for relationships
        userData.users.forEach(user => {
            if (user.posts) {
                posts.upsertMany(user.posts);
                userPostsIndex.set(user.id, user.posts.map(p => p.id));
            }
        });
    }
    
    loadUsers();
}, []);

function UserList() {
    const userList = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.values()
    );
    
    const updateUser = async (id: string, updates: Partial<User>) => {
        // Update local state immediately
        const existing = users.advanced.collection.get(id);
        if (existing) {
            users.upsert({ ...existing, ...updates });
        }
        
        // Sync with server
        try {
            await fetch(`/api/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
        } catch (error) {
            // Handle error, possibly revert local changes
            console.error('Failed to update user:', error);
        }
    };
    
    return (
        <div>
            {userList.map(user => (
                <UserItem 
                    key={user.id} 
                    user={user}
                    onUpdate={(name) => updateUser(user.id, { name })}
                />
            ))}
        </div>
    );
}
```
```

### Key Differences

| Apollo Client | OIMDB |
|---------------|-------|
| GraphQL queries | Direct data access |
| Server state management | Local state with sync |
| Automatic caching | Manual index management |
| Optimistic updates | Immediate local updates |
| `useQuery()` hook | `useExternalStore` hook (React 18+) |

## Migration from React Query

### Before (React Query)

```typescript
import { useQuery, useMutation, useQueryClient } from 'react-query';

function UserList() {
    const queryClient = useQueryClient();
    const { data: users, isLoading } = useQuery('users', fetchUsers);
    const updateUserMutation = useMutation(updateUser, {
        onSuccess: () => {
            queryClient.invalidateQueries('users');
        }
    });
    
    if (isLoading) return <div>Loading...</div>;
    
    return (
        <div>
            {users.map(user => (
                <UserItem 
                    key={user.id} 
                    user={user}
                    onUpdate={(updates) => updateUserMutation.mutate(updates)}
                />
            ))}
        </div>
    );
}
```

### After (OIMDB)

```typescript
import { createDb } from 'oimdb/dx';

const db = createDb({ scheduler: 'microtask' });
const users = db.createCollection<User>();

function UserList() {
    const [userList, setUserList] = useState<User[]>([]);
    
    useEffect(() => {
        // Load initial data
        async function loadUsers() {
            const userData = await fetchUsers();
            users.upsertMany(userData);
        }
        
        loadUsers();
        
        // Subscribe to updates
        const unsubscribe = users.subscribeMany(
            users.advanced.collection.keys(),
            () => {
                setUserList(users.advanced.collection.values());
            }
        );
        
        setUserList(users.advanced.collection.values());
        return unsubscribe;
    }, []);
    
    const updateUser = async (updates: Partial<User> & { id: string }) => {
        // Optimistic update
        const existing = users.advanced.collection.get(updates.id);
        if (existing) {
            users.upsert({ ...existing, ...updates });
        }
        
        // Sync with server
        try {
            await updateUserOnServer(updates);
        } catch (error) {
            // Revert on error
            if (existing) {
                users.upsert(existing);
            }
        }
    };
    
    return (
        <div>
            {userList.map(user => (
                <UserItem 
                    key={user.id} 
                    user={user}
                    onUpdate={(updates) => updateUser({ ...updates, id: user.id })}
                />
            ))}
        </div>
    );
}
```

### Key Differences

| React Query | OIMDB |
|-------------|-------|
| Server state management | Local state with sync |
| Automatic background updates | Manual event-driven updates |
| Query invalidation | Direct state mutations |
| Optimistic updates | Immediate local updates |
| `useQuery()` hook | `useExternalStore` hook (React 18+) |

## Migration Strategies

### 1. Gradual Migration

```typescript
// Start with OIMDB for new features
const newFeatureDb = createDb({ scheduler: 'microtask' });
const newFeatureCollection = newFeatureDb.createCollection<NewFeature>();

// Keep existing state management for legacy code
// Gradually migrate components one by one

// For React 18+, use useExternalStore for new components:
function NewFeatureComponent() {
    const features = useExternalStore(
        newFeatureCollection.advanced.collection.subscribe,
        () => newFeatureCollection.advanced.collection.values()
    );
    
    return <div>{features.map(f => <FeatureItem key={f.id} feature={f} />)}</div>;
}
```

### 2. Hybrid Approach

```typescript
// Use OIMDB for frequently changing data
const realtimeDb = createDb({ scheduler: 'microtask' });
const realtimeData = realtimeDb.createCollection<RealtimeData>();

// Use existing solution for static data
const staticData = useStaticData();

// React 18+ integration with useExternalStore:
function HybridComponent() {
    // OIMDB for real-time data
    const realtimeItems = useExternalStore(
        realtimeData.advanced.collection.subscribe,
        () => realtimeData.advanced.collection.values()
    );
    
    // Existing solution for static data
    const staticItems = useStaticData();
    
    return (
        <div>
            <h3>Real-time Data:</h3>
            {realtimeItems.map(item => <Item key={item.id} item={item} />)}
            <h3>Static Data:</h3>
            {staticItems.map(item => <Item key={item.id} item={item} />)}
        </div>
    );
}
```

### 3. Complete Replacement

```typescript
// Replace entire state management system
const appDb = createDb({ scheduler: 'microtask' });

// Migrate all collections at once
const users = appDb.createCollection<User>();
const posts = appDb.createCollection<Post>();
const comments = appDb.createCollection<Comment>();

// Build all indexes
const userPostsIndex = appDb.createIndex<string, string>();
const postCommentsIndex = appDb.createIndex<string, string>();

// React 18+ integration with useExternalStore:
function App() {
    const userList = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.values()
    );
    
    const postList = useExternalStore(
        posts.advanced.collection.subscribe,
        () => posts.advanced.collection.values()
    );
    
    return (
        <div>
            <UserList users={userList} />
            <PostList posts={postList} />
        </div>
    );
}
```

## Common Patterns

### 1. Data Loading

```typescript
// Traditional approach with useState + useEffect
function useDataLoader<T>(collection: ReturnType<typeof db.createCollection<T>>, loader: () => Promise<T[]>) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    useEffect(() => {
        async function load() {
            try {
                setIsLoading(true);
                setError(null);
                const data = await loader();
                collection.upsertMany(data);
            } catch (err) {
                setError(err as Error);
            } finally {
                setIsLoading(false);
            }
        }
        
        load();
    }, []);
    
    return { isLoading, error };
}

// Usage
const { isLoading, error } = useDataLoader(users, fetchUsers);

// Recommended approach for React 18+ with useExternalStore:
function UserListWithExternalStore() {
    const userList = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.values()
    );
    
    return (
        <div>
            {userList.map(user => (
                <UserItem key={user.id} user={user} />
            ))}
        </div>
    );
}
```

### 2. Optimistic Updates

```typescript
// Traditional approach with useCallback
function useOptimisticUpdate<T>(
    collection: ReturnType<typeof db.createCollection<T>>,
    updater: (data: T) => Promise<void>
) {
    return useCallback(async (id: string, updates: Partial<T>) => {
        const existing = collection.advanced.collection.get(id);
        if (!existing) return;
        
        // Store original state
        const original = { ...existing };
        
        // Apply optimistic update
        collection.upsert({ ...existing, ...updates });
        
        try {
            // Sync with server
            await updater({ ...existing, ...updates });
        } catch (error) {
            // Revert on error
            collection.upsert(original);
            throw error;
        }
    }, [collection, updater]);
}

// Usage
const updateUser = useOptimisticUpdate(users, updateUserOnServer);

// With useExternalStore, the UI automatically updates when the collection changes
function UserProfile({ userId }: { userId: string }) {
    const user = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.get(userId)
    );
    
    const handleUpdate = async (updates: Partial<User>) => {
        if (user) {
            // Optimistic update - UI updates immediately
            users.upsert({ ...user, ...updates });
            
            try {
                await updateUserOnServer({ ...user, ...updates });
            } catch (error) {
                // Revert on error - UI updates automatically
                users.upsert(user);
            }
        }
    };
    
    return <div>{user?.name}</div>;
}
```

### 3. Real-time Sync

```typescript
// Traditional approach with useEffect
function useRealtimeSync<T>(
    collection: ReturnType<typeof db.createCollection<T>>,
    syncFunction: (data: T) => Promise<void>
) {
    useEffect(() => {
        const unsubscribe = collection.subscribeMany(
            collection.advanced.collection.keys(),
            async (entity) => {
                try {
                    await syncFunction(entity);
                } catch (error) {
                    console.error('Sync failed:', error);
                }
            }
        );
        
        return unsubscribe;
    }, [collection, syncFunction]);
}

// Usage
useRealtimeSync(users, (user) => syncUserToServer(user));

// With useExternalStore, you can also sync specific entities:
function UserSync({ userId }: { userId: string }) {
    const user = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.get(userId)
    );
    
    useEffect(() => {
        if (user) {
            syncUserToServer(user);
        }
    }, [user]);
    
    return null; // This component only handles syncing
}
```

## React Integration with useExternalStore

### Why useExternalStore?

React 18+ provides `useExternalStore` which is **the recommended approach** for integrating with OIMDB. OIMDB is specifically designed to work seamlessly with this hook and provides built-in subscription methods that work perfectly with it:

- **Perfect compatibility** - OIMDB's subscribe methods return exactly what useExternalStore expects
- **Automatic subscription management** - no need to manually subscribe/unsubscribe
- **Concurrent rendering support** - works seamlessly with React 18+ features
- **Performance optimized** - React handles subscription lifecycle efficiently
- **Simpler code** - eliminates useState + useEffect boilerplate

### Basic Pattern

```typescript
import { useExternalStore } from 'react';

function UserProfile({ userId }: { userId: string }) {
    const user = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.get(userId)
    );
    
    // user automatically updates when the entity changes
    // OIMDB's subscribe method is perfectly compatible with useExternalStore
    // The subscribe method returns a function that useExternalStore can use
    return <div>{user?.name}</div>;
}
```

### Collection Pattern

```typescript
function UserList() {
    const userList = useExternalStore(
        users.advanced.collection.subscribe,
        () => users.advanced.collection.values()
    );
    
    return (
        <div>
            {userList.map(user => (
                <UserItem key={user.id} user={user} />
            ))}
        </div>
    );
}
```

### Index Pattern

```typescript
function AdminUsers() {
    const adminUserIds = useExternalStore(
        adminIndex.advanced.index.subscribe,
        () => adminIndex.get('admin')
    );
    
    const adminUsers = useExternalStore(
        users.advanced.collection.subscribe,
        () => adminUserIds?.map(id => users.advanced.collection.get(id)).filter(Boolean) || []
    );
    
    return (
        <div>
            {adminUsers.map(user => (
                <UserItem key={user.id} user={user} />
            ))}
        </div>
    );
}
```

## Best Practices

### 1. React Integration
- **Use `useExternalStore` for React 18+** - it's the recommended approach
- **OIMDB is React-optimized** - built-in subscription methods work perfectly with React
- **Automatic cleanup** - React handles subscription lifecycle automatically
- **Concurrent rendering support** - works seamlessly with React 18+ features

### 2. Data Normalization
- Keep entities flat and normalized
- Use indexes for relationships
- Avoid nested objects in entities

### 3. Event Management
- Choose appropriate schedulers
- Subscribe only to needed entities
- Use batch operations when possible
- **OIMDB + React integration** - use `useExternalStore` for automatic subscription management

### 4. Performance
- Monitor memory usage
- Clean up unused subscriptions
- Use indexes for frequent queries
- **React performance** - `useExternalStore` automatically optimizes re-renders

### 5. Error Handling
- Implement optimistic updates
- Handle sync failures gracefully
- Provide user feedback for errors
- **React error boundaries** - OIMDB errors can be caught by React error boundaries

By following these migration patterns, you can successfully transition from other state management solutions to OIMDB while maintaining your application's functionality and improving performance.

## Summary

OIMDB provides a modern, performant alternative to traditional state management solutions with seamless React 18+ integration through `useExternalStore`. The library is specifically designed to work with React's concurrent features and provides automatic subscription management, eliminating the need for manual cleanup and state synchronization.

### Key Benefits of OIMDB + React 18+

- **Automatic React integration** - `useExternalStore` handles all subscription lifecycle
- **Concurrent rendering support** - works seamlessly with React 18+ features
- **Performance optimized** - React automatically optimizes re-renders
- **Simpler code** - no more useState + useEffect boilerplate
- **Type safety** - full TypeScript support throughout the system
- **Event-driven architecture** - reactive updates without manual state management
