import {
    OIMReactiveCollection,
    OIMReactiveIndexManual,
    OIMReactiveIndex,
    OIMIndex,
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
} from '@oimdb/core';
import { Store, createStore, combineReducers, Action } from 'redux';
import {
    OIMDBReducerFactory,
    TOIMDefaultCollectionState,
    TOIMDefaultIndexState,
    EOIMDBReducerActionType,
    TOIMCollectionReducerChildOptions,
    findUpdatedInArray,
} from '../src';

interface User {
    id: string;
    name: string;
    age: number;
    email: string;
}

interface Post {
    id: string;
    title: string;
    content: string;
    authorId: string;
}

describe('OIMDBReducerFactory', () => {
    let queue: OIMEventQueue;
    let factory: OIMDBReducerFactory;
    let store: Store;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
        factory = new OIMDBReducerFactory(queue);

        // Create mock Redux store
        store = createStore((state = {}) => state);
        factory.setStore(store);
    });

    afterEach(() => {
        queue.destroy();
    });

    describe('createCollectionReducer', () => {
        let collection: OIMReactiveCollection<User, string>;
        let reducer: ReturnType<typeof factory.createCollectionReducer>;

        beforeEach(() => {
            collection = new OIMReactiveCollection<User, string>(queue);
            reducer = factory.createCollectionReducer(collection);
        });

        test('should initialize state with all entities on first OIMDB_UPDATE', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);

            queue.flush();
            const state = reducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            });

            expect(state).toEqual({
                entities: {
                    '1': {
                        id: '1',
                        name: 'Alice',
                        age: 30,
                        email: 'alice@test.com',
                    },
                    '2': {
                        id: '2',
                        name: 'Bob',
                        age: 25,
                        email: 'bob@test.com',
                    },
                },
                ids: ['1', '2'],
            });
        });

        test('should update only changed entities on subsequent updates', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);

            queue.flush();
            const initialState = reducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultCollectionState<User, string>;

            // Update only one entity
            collection.upsertOne({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultCollectionState<User, string>;

            expect(updatedState.entities['1']).toEqual({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            expect(updatedState.entities['2']).toEqual(
                initialState.entities['2']
            );
            expect(updatedState.ids).toEqual(['1', '2']);
        });

        test('should remove deleted entities', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);

            queue.flush();
            const initialState = reducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultCollectionState<User, string>;

            // Remove one entity
            collection.removeOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultCollectionState<User, string>;

            expect(updatedState.entities['1']).toBeUndefined();
            expect(updatedState.entities['2']).toBeDefined();
            expect(updatedState.ids).toEqual(['2']);
        });

        test('should work with custom mapper', () => {
            const customMapper: (
                coll: OIMReactiveCollection<User, string>,
                _updatedKeys: Set<string>,
                _currentState: { users: User[] } | undefined
            ) => { users: User[] } = coll => {
                const allUsers = coll.getAll();
                return { users: allUsers };
            };

            const customReducer = factory.createCollectionReducer(
                collection,
                customMapper
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);

            queue.flush();
            const state = customReducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            });

            expect(state).toEqual({
                users: [
                    {
                        id: '1',
                        name: 'Alice',
                        age: 30,
                        email: 'alice@test.com',
                    },
                    { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
                ],
            });
        });
    });

    describe('createIndexReducer', () => {
        let index: OIMReactiveIndexManual<string, string>;
        let reducer: ReturnType<typeof factory.createIndexReducer>;

        beforeEach(() => {
            index = new OIMReactiveIndexManual<string, string>(queue);
            reducer = factory.createIndexReducer(index);
        });

        test('should initialize state with all index keys on first OIMDB_UPDATE', () => {
            index.setPks('department1', ['user1', 'user2']);
            index.setPks('department2', ['user3']);

            queue.flush();
            const state = reducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultIndexState<string, string>;

            expect(state.entities).toEqual({
                department1: { key: 'department1', ids: ['user1', 'user2'] },
                department2: { key: 'department2', ids: ['user3'] },
            });
        });

        test('should update only changed keys on subsequent updates', () => {
            index.setPks('department1', ['user1', 'user2']);
            index.setPks('department2', ['user3']);

            queue.flush();
            const initialState = reducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultIndexState<string, string>;

            // Update only one key
            index.setPks('department1', ['user1', 'user2', 'user4']);
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultIndexState<string, string>;

            expect(updatedState.entities.department1).toEqual({
                key: 'department1',
                ids: ['user1', 'user2', 'user4'],
            });
            expect(updatedState.entities.department2).toEqual(
                initialState.entities.department2
            );
        });

        test('should work with custom mapper', () => {
            const customMapper: (
                idx: OIMReactiveIndex<string, string, OIMIndex<string, string>>,
                _updatedKeys: Set<string>,
                _currentState:
                    | { mappings: Record<string, string[]> }
                    | undefined
            ) => { mappings: Record<string, string[]> } = idx => {
                const mappings: Record<string, string[]> = {};
                for (const key of idx.getKeys()) {
                    mappings[key] = Array.from(idx.getPksByKey(key));
                }
                return { mappings };
            };

            const customReducer = factory.createIndexReducer(
                index,
                customMapper
            );

            index.setPks('department1', ['user1', 'user2']);
            queue.flush();

            const state = customReducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            });

            expect(state).toEqual({
                mappings: {
                    department1: ['user1', 'user2'],
                },
            });
        });
    });

    describe('store dispatch integration', () => {
        test('should dispatch OIMDB_UPDATE action on queue flush', () => {
            const dispatchSpy = jest.spyOn(store, 'dispatch');
            const collection = new OIMReactiveCollection<User, string>(queue);
            factory.createCollectionReducer(collection);

            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });

            queue.flush();

            expect(dispatchSpy).toHaveBeenCalledWith({
                type: EOIMDBReducerActionType.UPDATE,
            });
        });
    });

    describe('multiple reducers integration', () => {
        test('should work with collections and indexes in combineReducers', () => {
            const usersCollection = new OIMReactiveCollection<User, string>(
                queue
            );
            const postsCollection = new OIMReactiveCollection<Post, string>(
                queue
            );
            const usersByDepartmentIndex = new OIMReactiveIndexManual<
                string,
                string
            >(queue);

            const usersReducer =
                factory.createCollectionReducer(usersCollection);
            const postsReducer =
                factory.createCollectionReducer(postsCollection);
            const usersByDepartmentReducer = factory.createIndexReducer(
                usersByDepartmentIndex
            );

            const rootReducer = combineReducers({
                users: usersReducer,
                posts: postsReducer,
                usersByDepartment: usersByDepartmentReducer,
            });

            const rootStore = createStore(rootReducer);
            factory.setStore(rootStore);

            // Add users
            usersCollection.upsertMany([
                {
                    id: 'user1',
                    name: 'Alice',
                    age: 30,
                    email: 'alice@test.com',
                },
                {
                    id: 'user2',
                    name: 'Bob',
                    age: 25,
                    email: 'bob@test.com',
                },
            ]);

            // Add posts
            postsCollection.upsertMany([
                {
                    id: 'post1',
                    title: 'First Post',
                    content: 'Content 1',
                    authorId: 'user1',
                },
                {
                    id: 'post2',
                    title: 'Second Post',
                    content: 'Content 2',
                    authorId: 'user2',
                },
            ]);

            // Set up index
            usersByDepartmentIndex.setPks('engineering', ['user1', 'user2']);
            usersByDepartmentIndex.setPks('design', ['user1']);

            // Flush will dispatch action automatically, but we need to wait for it
            queue.flush();
            // Action is dispatched automatically by factory, state should be updated
            // But we need to get state after dispatch completes
            const state = rootStore.getState() as {
                users: TOIMDefaultCollectionState<User, string>;
                posts: TOIMDefaultCollectionState<Post, string>;
                usersByDepartment: TOIMDefaultIndexState<string, string>;
            };

            // Verify users collection
            expect(state.users).toBeDefined();
            expect(state.users.entities).toBeDefined();
            expect(state.users.entities['user1']).toEqual({
                id: 'user1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            expect(state.users.entities['user2']).toEqual({
                id: 'user2',
                name: 'Bob',
                age: 25,
                email: 'bob@test.com',
            });
            expect(state.users.ids).toEqual(
                expect.arrayContaining(['user1', 'user2'])
            );
            expect(state.users.ids).toHaveLength(2);

            // Verify posts collection
            expect(state.posts).toBeDefined();
            expect(state.posts.entities).toBeDefined();
            expect(state.posts.entities['post1']).toEqual({
                id: 'post1',
                title: 'First Post',
                content: 'Content 1',
                authorId: 'user1',
            });
            expect(state.posts.entities['post2']).toEqual({
                id: 'post2',
                title: 'Second Post',
                content: 'Content 2',
                authorId: 'user2',
            });
            expect(state.posts.ids).toEqual(
                expect.arrayContaining(['post1', 'post2'])
            );
            expect(state.posts.ids).toHaveLength(2);

            // Verify index
            expect(state.usersByDepartment).toBeDefined();
            expect(state.usersByDepartment.entities).toBeDefined();
            expect(state.usersByDepartment.entities.engineering).toEqual({
                key: 'engineering',
                ids: ['user1', 'user2'],
            });
            expect(state.usersByDepartment.entities.design).toEqual({
                key: 'design',
                ids: ['user1'],
            });

            // Update one user and verify only users changed
            usersCollection.upsertOne({
                id: 'user1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            queue.flush();

            const updatedState = rootStore.getState() as {
                users: TOIMDefaultCollectionState<User, string>;
                posts: TOIMDefaultCollectionState<Post, string>;
                usersByDepartment: TOIMDefaultIndexState<string, string>;
            };
            expect(updatedState.users.entities['user1'].name).toBe(
                'Alice Updated'
            );
            expect(updatedState.users.entities['user1'].age).toBe(31);
            expect(updatedState.posts.entities['post1']).toEqual(
                state.posts.entities['post1']
            );
            expect(updatedState.usersByDepartment.entities.engineering).toEqual(
                state.usersByDepartment.entities.engineering
            );
        });
    });

    describe('child reducer integration', () => {
        let collection: OIMReactiveCollection<User, string>;
        let factory: OIMDBReducerFactory;
        let store: Store;
        let queue: OIMEventQueue;

        beforeEach(() => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            factory = new OIMDBReducerFactory(queue);
            collection = new OIMReactiveCollection<User, string>(queue);

            store = createStore((state = {}) => state);
            factory.setStore(store);
        });

        afterEach(() => {
            queue.destroy();
        });

        test('should update Redux state when child reducer handles custom action', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            // Create reducer with child
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

            const childOptions: TOIMCollectionReducerChildOptions<
                User,
                string,
                TOIMDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = factory.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const rootStore = createStore(reducer);
            factory.setStore(rootStore);

            // Initial state should be populated
            const initialState =
                rootStore.getState() as TOIMDefaultCollectionState<
                    User,
                    string
                >;
            expect(initialState.entities['1'].name).toBe('Alice');

            // Dispatch custom action through child reducer
            rootStore.dispatch({
                type: 'UPDATE_USER_NAME',
                id: '1',
                name: 'Alice Updated',
            });

            // State should be updated
            const updatedState =
                rootStore.getState() as TOIMDefaultCollectionState<
                    User,
                    string
                >;
            expect(updatedState.entities['1'].name).toBe('Alice Updated');
            expect(updatedState.entities['1'].age).toBe(30); // Other fields unchanged
        });

        test('should sync child reducer changes back to OIMDB collection', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            // Create reducer with child
            const childReducer = (
                state: TOIMDefaultCollectionState<User, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER') {
                    const typedAction = action as {
                        type: string;
                        user: User;
                    };
                    return {
                        ...state,
                        entities: {
                            ...state.entities,
                            [typedAction.user.id]: typedAction.user,
                        },
                    };
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                User,
                string,
                TOIMDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = factory.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const rootStore = createStore(reducer);
            factory.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            // Update user through child reducer
            rootStore.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice.updated@test.com',
                },
            });

            // Flush to process sync
            queue.flush();

            // Collection should be updated
            const updatedUser = collection.getOneByPk('1');
            expect(updatedUser).toBeDefined();
            expect(updatedUser?.name).toBe('Alice Updated');
            expect(updatedUser?.age).toBe(31);
            expect(updatedUser?.email).toBe('alice.updated@test.com');

            // Original user should remain unchanged
            const originalUser = collection.getOneByPk('2');
            expect(originalUser?.name).toBe('Bob');
        });

        test('should sync added entities from child reducer to OIMDB', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            const childReducer = (
                state: TOIMDefaultCollectionState<User, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'ADD_USER') {
                    const typedAction = action as {
                        type: string;
                        user: User;
                    };
                    return {
                        entities: {
                            ...state.entities,
                            [typedAction.user.id]: typedAction.user,
                        },
                        ids: [...state.ids, typedAction.user.id],
                    };
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                User,
                string,
                TOIMDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = factory.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const rootStore = createStore(reducer);
            factory.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            // Add user through child reducer
            rootStore.dispatch({
                type: 'ADD_USER',
                user: {
                    id: '2',
                    name: 'Bob',
                    age: 25,
                    email: 'bob@test.com',
                },
            });

            // Flush to process sync
            queue.flush();

            // Collection should have new user
            const newUser = collection.getOneByPk('2');
            expect(newUser).toBeDefined();
            expect(newUser?.name).toBe('Bob');
            expect(newUser?.age).toBe(25);

            // Original user should still be there
            const originalUser = collection.getOneByPk('1');
            expect(originalUser?.name).toBe('Alice');
        });

        test('should sync removed entities from child reducer to OIMDB', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            const childReducer = (
                state: TOIMDefaultCollectionState<User, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'REMOVE_USER') {
                    const typedAction = action as {
                        type: string;
                        id: string;
                    };
                    const newEntities = { ...state.entities };
                    delete newEntities[typedAction.id];
                    return {
                        entities: newEntities,
                        ids: state.ids.filter(id => id !== typedAction.id),
                    };
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                User,
                string,
                TOIMDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = factory.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const rootStore = createStore(reducer);
            factory.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            // Remove user through child reducer
            rootStore.dispatch({
                type: 'REMOVE_USER',
                id: '1',
            });

            // Flush to process sync
            queue.flush();

            // User should be removed from collection
            const removedUser = collection.getOneByPk('1');
            expect(removedUser).toBeUndefined();

            // Other user should remain
            const remainingUser = collection.getOneByPk('2');
            expect(remainingUser).toBeDefined();
            expect(remainingUser?.name).toBe('Bob');
        });

        test('should not create infinite loop when syncing from child to OIMDB', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            let updateCount = 0;
            const childReducer = (
                state: TOIMDefaultCollectionState<User, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER') {
                    updateCount++;
                    const typedAction = action as {
                        type: string;
                        user: User;
                    };
                    return {
                        ...state,
                        entities: {
                            ...state.entities,
                            [typedAction.user.id]: typedAction.user,
                        },
                    };
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                User,
                string,
                TOIMDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = factory.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const rootStore = createStore(reducer);
            factory.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            // Update through child reducer
            rootStore.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });

            // Flush to process sync
            queue.flush();

            // Should only update once (no infinite loop)
            expect(updateCount).toBe(1);

            // State should be updated
            const state = rootStore.getState() as TOIMDefaultCollectionState<
                User,
                string
            >;
            expect(state.entities['1'].name).toBe('Alice Updated');
        });

        test('should sync changes from child reducer with array-based state using custom extractor', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            // State structure with array instead of entities object
            type ArrayBasedState = {
                users: User[];
            };

            const childReducer = (
                state: ArrayBasedState | undefined,
                action: Action
            ): ArrayBasedState => {
                // Handle undefined or non-ArrayBasedState (from OIMDB mapper)
                if (
                    state === undefined ||
                    !('users' in state) ||
                    !Array.isArray(state.users)
                ) {
                    return { users: [] };
                }
                if (action.type === 'ADD_USER') {
                    const typedAction = action as {
                        type: string;
                        user: User;
                    };
                    return {
                        users: [...state.users, typedAction.user],
                    };
                }
                if (action.type === 'UPDATE_USER') {
                    const typedAction = action as {
                        type: string;
                        user: User;
                    };
                    return {
                        users: state.users.map(u =>
                            u.id === typedAction.user.id ? typedAction.user : u
                        ),
                    };
                }
                if (action.type === 'REMOVE_USER') {
                    const typedAction = action as {
                        type: string;
                        id: string;
                    };
                    return {
                        users: state.users.filter(u => u.id !== typedAction.id),
                    };
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                User,
                string,
                ArrayBasedState
            > = {
                reducer: childReducer,
                extractEntities: (prevState, nextState, collection, getPk) => {
                    const prevUsers = prevState?.users ?? [];
                    const nextUsers = nextState.users;

                    // Extract IDs from arrays
                    const prevIds = prevUsers.map(u => getPk(u));
                    const nextIds = nextUsers.map(u => getPk(u));

                    // Find differences using array comparison
                    const diff = findUpdatedInArray(prevIds, nextIds);

                    // Upsert added and updated entities
                    const toUpsert: User[] = [];
                    for (let i = 0; i < nextUsers.length; i++) {
                        const user = nextUsers[i];
                        const pk = getPk(user);
                        if (
                            diff.added.includes(pk) ||
                            diff.updated.includes(pk)
                        ) {
                            toUpsert.push(user);
                        }
                    }
                    if (toUpsert.length > 0) {
                        collection.upsertMany(toUpsert);
                    }

                    // Remove deleted entities by PKs
                    if (diff.removed.length > 0) {
                        collection.removeManyByPks(diff.removed);
                    }
                },
                getPk: entity => entity.id,
            };

            const reducer = factory.createCollectionReducer(
                collection,
                // Custom mapper to convert OIMDB state to ArrayBasedState
                collection => {
                    const allUsers = collection.getAll();
                    return {
                        users: allUsers,
                    };
                },
                childOptions
            );

            const rootStore = createStore(reducer);
            factory.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            // Add new user through child reducer
            rootStore.dispatch({
                type: 'ADD_USER',
                user: {
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                },
            });

            queue.flush();

            // New user should be in collection
            const newUser = collection.getOneByPk('3');
            expect(newUser).toBeDefined();
            expect(newUser?.name).toBe('Charlie');

            // Update existing user
            rootStore.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });

            queue.flush();

            // User should be updated in collection
            const updatedUser = collection.getOneByPk('1');
            expect(updatedUser?.name).toBe('Alice Updated');
            expect(updatedUser?.age).toBe(31);

            // Remove user
            rootStore.dispatch({
                type: 'REMOVE_USER',
                id: '2',
            });

            queue.flush();

            // User should be removed from collection
            const removedUser = collection.getOneByPk('2');
            expect(removedUser).toBeUndefined();

            // Other users should remain
            expect(collection.getOneByPk('1')).toBeDefined();
            expect(collection.getOneByPk('3')).toBeDefined();
        });
    });
});
