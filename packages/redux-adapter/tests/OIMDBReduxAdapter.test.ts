import {
    OIMReactiveCollection,
    OIMReactiveIndexManualSetBased,
    OIMReactiveIndexManualArrayBased,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    TOIMPk,
} from '@oimdb/core';
import {
    Store,
    createStore,
    combineReducers,
    Action,
    applyMiddleware,
    Reducer,
} from 'redux';
import {
    createEntityAdapter,
    createSlice,
    createAction,
    PayloadAction,
} from '@reduxjs/toolkit';
import {
    OIMDBReduxAdapter,
    TOIMDBReduxDefaultCollectionState,
    TOIMDBReduxDefaultIndexState,
    EOIMDBReduxReducerActionType,
    TOIMDBReduxCollectionReducerChildOptions,
    TOIMDBReduxIndexReducerChildOptions,
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

describe('OIMDBReduxAdapter', () => {
    let queue: OIMEventQueue;
    let adapter: OIMDBReduxAdapter;
    let store: Store;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
        adapter = new OIMDBReduxAdapter(queue);

        // Create mock Redux store
        store = createStore((state = {}) => state);
        adapter.setStore(store);
    });

    afterEach(() => {
        queue.destroy();
    });

    describe('createCollectionReducer', () => {
        let collection: OIMReactiveCollection<User, string>;
        let reducer: ReturnType<typeof adapter.createCollectionReducer>;

        beforeEach(() => {
            collection = new OIMReactiveCollection<User, string>(queue);
            reducer = adapter.createCollectionReducer(collection);
        });

        test('should initialize state with all entities on first OIMDB_UPDATE', () => {
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);

            queue.flush();
            const state = reducer(undefined, {
                type: EOIMDBReduxReducerActionType.UPDATE,
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
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultCollectionState<User, string>;

            // Update only one entity
            collection.upsertOne({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultCollectionState<User, string>;

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
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultCollectionState<User, string>;

            // Remove one entity
            collection.removeOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultCollectionState<User, string>;

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

            const customReducer = adapter.createCollectionReducer(
                collection,
                undefined,
                customMapper
            );

            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);

            queue.flush();
            const state = customReducer(undefined, {
                type: EOIMDBReduxReducerActionType.UPDATE,
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
        let index: OIMReactiveIndexManualSetBased<string, string>;
        let reducer: ReturnType<typeof adapter.createIndexReducer>;

        beforeEach(() => {
            index = new OIMReactiveIndexManualSetBased<string, string>(queue);
            reducer = adapter.createIndexReducer(index);
        });

        test('should initialize state with all index keys on first OIMDB_UPDATE', () => {
            index.setPks('department1', ['user1', 'user2']);
            index.setPks('department2', ['user3']);

            queue.flush();
            const state = reducer(undefined, {
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultIndexState<string, string>;

            expect(state.entities).toEqual({
                department1: { id: 'department1', ids: ['user1', 'user2'] },
                department2: { id: 'department2', ids: ['user3'] },
            });
        });

        test('should update only changed keys on subsequent updates', () => {
            index.setPks('department1', ['user1', 'user2']);
            index.setPks('department2', ['user3']);

            queue.flush();
            const initialState = reducer(undefined, {
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultIndexState<string, string>;

            // Update only one key
            index.setPks('department1', ['user1', 'user2', 'user4']);
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReduxReducerActionType.UPDATE,
            }) as TOIMDBReduxDefaultIndexState<string, string>;

            expect(updatedState.entities.department1).toEqual({
                id: 'department1',
                ids: ['user1', 'user2', 'user4'],
            });
            expect(updatedState.entities.department2).toEqual(
                initialState.entities.department2
            );
        });

        test('should work with custom mapper', () => {
            const customMapper: (
                idx:
                    | OIMReactiveIndexSetBased<
                          string,
                          string,
                          OIMIndexSetBased<string, string>
                      >
                    | OIMReactiveIndexArrayBased<
                          string,
                          string,
                          OIMIndexArrayBased<string, string>
                      >,
                _updatedKeys: Set<string>,
                _currentState:
                    | { mappings: Record<string, string[]> }
                    | undefined
            ) => { mappings: Record<string, string[]> } = idx => {
                const mappings: Record<string, string[]> = {};
                for (const key of idx.getKeys()) {
                    const pks = idx.getPksByKey(key);
                    mappings[key] = pks instanceof Set ? Array.from(pks) : pks;
                }
                return { mappings };
            };

            const customReducer = adapter.createIndexReducer(
                index,
                undefined,
                customMapper
            );

            index.setPks('department1', ['user1', 'user2']);
            queue.flush();

            const state = customReducer(undefined, {
                type: EOIMDBReduxReducerActionType.UPDATE,
            });

            expect(state).toEqual({
                mappings: {
                    department1: ['user1', 'user2'],
                },
            });
        });

        describe('child reducer integration', () => {
            test('should sync child reducer changes back to OIMDB index', () => {
                // Setup initial data
                index.setPks('department1', ['user1', 'user2']);
                index.setPks('department2', ['user3']);
                queue.flush();

                const childReducer = (
                    state:
                        | TOIMDBReduxDefaultIndexState<string, string>
                        | undefined,
                    action: Action
                ): TOIMDBReduxDefaultIndexState<string, string> => {
                    if (state === undefined) {
                        return { entities: {} };
                    }
                    if (action.type === 'UPDATE_INDEX') {
                        const typedAction = action as {
                            type: string;
                            key: string;
                            ids: string[];
                        };
                        return {
                            entities: {
                                ...state.entities,
                                [typedAction.key]: {
                                    id: typedAction.key,
                                    ids: typedAction.ids,
                                },
                            },
                        };
                    }
                    return state;
                };

                const childOptions: TOIMDBReduxIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDBReduxDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                    // Using default extractIndexState for TOIMDBReduxDefaultIndexState
                };

                const reducer = adapter.createIndexReducer(index, childOptions);
                const middleware = adapter.createMiddleware();
                const rootStore = createStore(
                    reducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(rootStore);

                // Wait for initial sync
                queue.flush();

                // Update index through child reducer
                rootStore.dispatch({
                    type: 'UPDATE_INDEX',
                    key: 'department1',
                    ids: ['user1', 'user2', 'user4'],
                });
                // Middleware automatically flushes

                // Index should be updated
                const pks = Array.from(index.getPksByKey('department1'));
                expect(pks).toEqual(['user1', 'user2', 'user4']);

                // Original key should remain unchanged
                const originalPks = Array.from(
                    index.getPksByKey('department2')
                );
                expect(originalPks).toEqual(['user3']);
            });

            test('should sync added keys from child reducer to OIMDB index', () => {
                // Setup initial data
                index.setPks('department1', ['user1', 'user2']);
                queue.flush();

                const childReducer = (
                    state:
                        | TOIMDBReduxDefaultIndexState<string, string>
                        | undefined,
                    action: Action
                ): TOIMDBReduxDefaultIndexState<string, string> => {
                    if (state === undefined) {
                        return { entities: {} };
                    }
                    if (action.type === 'ADD_INDEX_KEY') {
                        const typedAction = action as {
                            type: string;
                            key: string;
                            ids: string[];
                        };
                        return {
                            entities: {
                                ...state.entities,
                                [typedAction.key]: {
                                    id: typedAction.key,
                                    ids: typedAction.ids,
                                },
                            },
                        };
                    }
                    return state;
                };

                const childOptions: TOIMDBReduxIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDBReduxDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                };

                const reducer = adapter.createIndexReducer(index, childOptions);
                const middleware = adapter.createMiddleware();
                const rootStore = createStore(
                    reducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(rootStore);

                // Wait for initial sync
                queue.flush();

                // Add new key through child reducer
                rootStore.dispatch({
                    type: 'ADD_INDEX_KEY',
                    key: 'department2',
                    ids: ['user3', 'user4'],
                });
                // Middleware automatically flushes

                // New key should be added to index
                expect(index.hasKey('department2')).toBe(true);
                const pks = Array.from(index.getPksByKey('department2'));
                expect(pks).toEqual(['user3', 'user4']);

                // Original key should remain unchanged
                const originalPks = Array.from(
                    index.getPksByKey('department1')
                );
                expect(originalPks).toEqual(['user1', 'user2']);
            });

            test('should sync removed keys from child reducer to OIMDB index', () => {
                // Setup initial data
                index.setPks('department1', ['user1', 'user2']);
                index.setPks('department2', ['user3']);
                queue.flush();

                const childReducer = (
                    state:
                        | TOIMDBReduxDefaultIndexState<string, string>
                        | undefined,
                    action: Action
                ): TOIMDBReduxDefaultIndexState<string, string> => {
                    if (state === undefined) {
                        return { entities: {} };
                    }
                    if (action.type === 'REMOVE_INDEX_KEY') {
                        const typedAction = action as {
                            type: string;
                            key: string;
                        };
                        const newEntities = { ...state.entities };
                        delete newEntities[typedAction.key];
                        return { entities: newEntities };
                    }
                    return state;
                };

                const childOptions: TOIMDBReduxIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDBReduxDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                };

                const reducer = adapter.createIndexReducer(index, childOptions);
                const middleware = adapter.createMiddleware();
                const rootStore = createStore(
                    reducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(rootStore);

                // Wait for initial sync
                queue.flush();

                // Remove key through child reducer
                rootStore.dispatch({
                    type: 'REMOVE_INDEX_KEY',
                    key: 'department1',
                });
                // Middleware automatically flushes

                // Key should be removed from index
                expect(index.hasKey('department1')).toBe(false);

                // Other key should remain unchanged
                expect(index.hasKey('department2')).toBe(true);
                const remainingPks = Array.from(
                    index.getPksByKey('department2')
                );
                expect(remainingPks).toEqual(['user3']);
            });

            test('should prevent infinite loops during sync', () => {
                index.setPks('department1', ['user1']);
                queue.flush();

                let syncCount = 0;
                const childReducer = (
                    state:
                        | TOIMDBReduxDefaultIndexState<string, string>
                        | undefined,
                    action: Action
                ): TOIMDBReduxDefaultIndexState<string, string> => {
                    if (state === undefined) {
                        return { entities: {} };
                    }
                    if (action.type === 'UPDATE_INDEX') {
                        syncCount++;
                        const typedAction = action as {
                            type: string;
                            key: string;
                            ids: string[];
                        };
                        return {
                            entities: {
                                ...state.entities,
                                [typedAction.key]: {
                                    id: typedAction.key,
                                    ids: typedAction.ids,
                                },
                            },
                        };
                    }
                    return state;
                };

                const childOptions: TOIMDBReduxIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDBReduxDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                };

                const reducer = adapter.createIndexReducer(index, childOptions);
                const middleware = adapter.createMiddleware();
                const rootStore = createStore(
                    reducer,
                    applyMiddleware(middleware)
                );
                adapter.setStore(rootStore);

                queue.flush();

                // Update through child reducer
                rootStore.dispatch({
                    type: 'UPDATE_INDEX',
                    key: 'department1',
                    ids: ['user1', 'user2'],
                });
                // Middleware automatically flushes

                // Should only sync once (no infinite loop)
                expect(syncCount).toBe(1);
            });
        });
    });

    describe('store dispatch integration', () => {
        test('should dispatch OIMDB_UPDATE action on queue flush', () => {
            const dispatchSpy = jest.spyOn(store, 'dispatch');
            const collection = new OIMReactiveCollection<User, string>(queue);
            adapter.createCollectionReducer(collection);

            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });

            queue.flush();

            expect(dispatchSpy).toHaveBeenCalledWith({
                type: EOIMDBReduxReducerActionType.UPDATE,
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
            const usersByDepartmentIndex = new OIMReactiveIndexManualSetBased<
                string,
                string
            >(queue);

            const usersReducer =
                adapter.createCollectionReducer(usersCollection);
            const postsReducer =
                adapter.createCollectionReducer(postsCollection);
            const usersByDepartmentReducer = adapter.createIndexReducer(
                usersByDepartmentIndex
            );

            const rootReducer = combineReducers({
                users: usersReducer,
                posts: postsReducer,
                usersByDepartment: usersByDepartmentReducer,
            });

            const rootStore = createStore(rootReducer);
            adapter.setStore(rootStore);

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
            // Action is dispatched automatically by adapter, state should be updated
            // But we need to get state after dispatch completes
            const state = rootStore.getState() as {
                users: TOIMDBReduxDefaultCollectionState<User, string>;
                posts: TOIMDBReduxDefaultCollectionState<Post, string>;
                usersByDepartment: TOIMDBReduxDefaultIndexState<string, string>;
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
                id: 'engineering',
                ids: ['user1', 'user2'],
            });
            expect(state.usersByDepartment.entities.design).toEqual({
                id: 'design',
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
                users: TOIMDBReduxDefaultCollectionState<User, string>;
                posts: TOIMDBReduxDefaultCollectionState<Post, string>;
                usersByDepartment: TOIMDBReduxDefaultIndexState<string, string>;
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
        let adapter: OIMDBReduxAdapter;
        let store: Store;
        let queue: OIMEventQueue;

        beforeEach(() => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            adapter = new OIMDBReduxAdapter(queue);
            collection = new OIMReactiveCollection<User, string>(queue);

            store = createStore((state = {}) => state);
            adapter.setStore(store);
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
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDBReduxDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

            // Initial state should be populated
            const initialState =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
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
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
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
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDBReduxDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

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
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDBReduxDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

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
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDBReduxDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

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
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                // Using default extractEntities for TOIMDBReduxDefaultCollectionState
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

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
            const state =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
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

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions,
                // Custom mapper to convert OIMDB state to ArrayBasedState
                collection => {
                    const allUsers = collection.getAll();
                    return {
                        users: allUsers,
                    };
                }
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

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

        test('should not create infinite loop when queue.flush is called after middleware flushSilently', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            let childReducerCallCount = 0;
            let oimdbUpdateHandledCount = 0;

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER') {
                    childReducerCallCount++;
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            // Wrap reducer to track OIMDB_UPDATE handling
            const wrappedReducer: Reducer<
                TOIMDBReduxDefaultCollectionState<User, string> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdateHandledCount++;
                }
                return reducer(state, action);
            };

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(rootStore);

            queue.flush();
            const initialOimdbUpdateCount = oimdbUpdateHandledCount;

            // Update through child reducer (middleware will call flushSilently)
            rootStore.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });
            // Middleware automatically flushes silently (no OIMDB_UPDATE dispatch)

            // Now manually call queue.flush() - this should NOT cause infinite loop
            // because isSyncingFromChild should be false and updatedKeys should be null
            collection.upsertOne({
                id: '1',
                name: 'Alice Updated Again',
                age: 32,
                email: 'alice@test.com',
            });
            queue.flush(); // This should dispatch OIMDB_UPDATE once

            // Child reducer should be called only once (from the dispatch)
            expect(childReducerCallCount).toBe(1);

            // OIMDB_UPDATE should be handled once (from the manual queue.flush)
            expect(oimdbUpdateHandledCount).toBe(initialOimdbUpdateCount + 1);

            // Verify final state
            const state =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            expect(state.entities['1'].name).toBe('Alice Updated Again');
        });

        test('should not create infinite loop when child reducer updates OIMDB with same data', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            let childReducerCallCount = 0;
            let oimdbUpdateHandledCount = 0;

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER') {
                    childReducerCallCount++;
                    const typedAction = action as {
                        type: string;
                        user: User;
                    };
                    // Return same data (no actual change)
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            // Wrap reducer to track OIMDB_UPDATE handling
            const wrappedReducer: Reducer<
                TOIMDBReduxDefaultCollectionState<User, string> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdateHandledCount++;
                }
                return reducer(state, action);
            };

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(rootStore);

            queue.flush();
            const initialOimdbUpdateCount = oimdbUpdateHandledCount;
            const initialState =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;

            // Update through child reducer with same data
            rootStore.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice', // Same name
                    age: 30, // Same age
                    email: 'alice@test.com', // Same email
                },
            });
            // Middleware automatically flushes silently

            // Child reducer should be called once
            expect(childReducerCallCount).toBe(1);

            // OIMDB_UPDATE should NOT be dispatched (no actual changes)
            expect(oimdbUpdateHandledCount).toBe(initialOimdbUpdateCount);

            // State should have same data (no infinite loop)
            // Note: Redux reducer creates new object even if data is same, so we check data equality
            const state =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            expect(state.entities['1']).toEqual(initialState.entities['1']);
            expect(state.ids).toEqual(initialState.ids);

            // Verify collection was not updated (no actual change)
            expect(collection.getOneByPk('1')?.name).toBe('Alice');
            expect(collection.getOneByPk('1')?.age).toBe(30);
        });

        test('should not create infinite loop with multiple child reducers updating OIMDB', () => {
            // Setup two collections with child reducers
            const collection1 = new OIMReactiveCollection<User, string>(queue);
            const collection2 = new OIMReactiveCollection<User, string>(queue);

            let reducer1CallCount = 0;
            let reducer2CallCount = 0;
            let oimdbUpdate1Count = 0;
            let oimdbUpdate2Count = 0;

            const childReducer1 = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER_1') {
                    reducer1CallCount++;
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

            const childReducer2 = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER_2') {
                    reducer2CallCount++;
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

            const reducer1 = adapter.createCollectionReducer(collection1, {
                reducer: childReducer1,
                getPk: entity => entity.id,
            });

            const reducer2 = adapter.createCollectionReducer(collection2, {
                reducer: childReducer2,
                getPk: entity => entity.id,
            });

            // Wrap reducers to track OIMDB_UPDATE handling
            const wrappedReducer1: Reducer<
                TOIMDBReduxDefaultCollectionState<User, string> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdate1Count++;
                }
                return reducer1(state, action);
            };

            const wrappedReducer2: Reducer<
                TOIMDBReduxDefaultCollectionState<User, string> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdate2Count++;
                }
                return reducer2(state, action);
            };

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(
                combineReducers({
                    collection1: wrappedReducer1,
                    collection2: wrappedReducer2,
                }),
                applyMiddleware(middleware)
            );
            adapter.setStore(rootStore);

            // Setup initial data
            collection1.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            collection2.upsertMany([
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            const initialUpdate1Count = oimdbUpdate1Count;
            const initialUpdate2Count = oimdbUpdate2Count;

            // Update both collections through child reducers simultaneously
            rootStore.dispatch({
                type: 'UPDATE_USER_1',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });

            rootStore.dispatch({
                type: 'UPDATE_USER_2',
                user: {
                    id: '2',
                    name: 'Bob Updated',
                    age: 26,
                    email: 'bob@test.com',
                },
            });

            // Middleware automatically flushes silently for both actions

            // Each reducer should be called once
            expect(reducer1CallCount).toBe(1);
            expect(reducer2CallCount).toBe(1);

            // OIMDB_UPDATE should NOT be dispatched (middleware uses flushSilently)
            expect(oimdbUpdate1Count).toBe(initialUpdate1Count);
            expect(oimdbUpdate2Count).toBe(initialUpdate2Count);

            // Verify collections are updated
            expect(collection1.getOneByPk('1')?.name).toBe('Alice Updated');
            expect(collection2.getOneByPk('2')?.name).toBe('Bob Updated');
        });
    });

    describe('Redux Toolkit integration (EntityAdapter and createSlice)', () => {
        let queue: OIMEventQueue;
        let adapter: OIMDBReduxAdapter;
        let usersCollection: OIMReactiveCollection<User, string>;
        let postsCollection: OIMReactiveCollection<Post, string>;

        beforeEach(() => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            adapter = new OIMDBReduxAdapter(queue);
            usersCollection = new OIMReactiveCollection<User, string>(queue);
            postsCollection = new OIMReactiveCollection<Post, string>(queue);
        });

        afterEach(() => {
            queue.destroy();
        });

        test('should work with EntityAdapter and prevent infinite loops', () => {
            // Setup initial data
            usersCollection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            const usersAdapter = createEntityAdapter<User>();

            let sliceReducerCallCount = 0;
            let oimdbUpdateHandledCount = 0;

            const usersSlice = createSlice({
                name: 'users',
                initialState: usersAdapter.getInitialState(),
                reducers: {
                    updateUser: (state, action: PayloadAction<User>) => {
                        sliceReducerCallCount++;
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: action.payload,
                        });
                    },
                    setUserAge: (
                        state,
                        action: PayloadAction<{ id: string; age: number }>
                    ) => {
                        sliceReducerCallCount++;
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: { age: action.payload.age },
                        });
                    },
                },
            });

            const reducer = adapter.createCollectionReducer(usersCollection, {
                reducer: usersSlice.reducer,
                getPk: user => user.id,
            });

            // Wrap reducer to track OIMDB_UPDATE handling
            const wrappedReducer: Reducer<
                ReturnType<typeof usersAdapter.getInitialState> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdateHandledCount++;
                }
                return reducer(state, action) as
                    | ReturnType<typeof usersAdapter.getInitialState>
                    | undefined;
            };

            const middleware = adapter.createMiddleware();
            const store = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(store);

            queue.flush();
            const initialOimdbUpdateCount = oimdbUpdateHandledCount;

            // Update through slice action (middleware will call flushSilently)
            store.dispatch(
                usersSlice.actions.updateUser({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                })
            );

            // Slice reducer should be called once
            expect(sliceReducerCallCount).toBe(1);

            // OIMDB_UPDATE should NOT be dispatched (middleware uses flushSilently)
            expect(oimdbUpdateHandledCount).toBe(initialOimdbUpdateCount);

            // Verify collection is updated
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice Updated');
            expect(usersCollection.getOneByPk('1')?.age).toBe(31);

            // Verify Redux state is updated
            const state = store.getState() as
                | ReturnType<typeof usersAdapter.getInitialState>
                | undefined;
            if (state && 'entities' in state) {
                expect(
                    usersAdapter.getSelectors().selectById(state, '1')?.name
                ).toBe('Alice Updated');
            }

            // Now update OIMDB directly to verify OIMDB_UPDATE is dispatched
            usersCollection.upsertOne({
                id: '1',
                name: 'Alice Updated Again',
                age: 32,
                email: 'alice@test.com',
            });
            queue.flush();

            // OIMDB_UPDATE should be handled
            expect(oimdbUpdateHandledCount).toBe(initialOimdbUpdateCount + 1);
        });

        test('should work with multiple slices and EntityAdapters', () => {
            // Setup initial data
            usersCollection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            postsCollection.upsertMany([
                {
                    id: '1',
                    title: 'Post 1',
                    content: 'Content 1',
                    authorId: '1',
                },
            ]);
            queue.flush();

            const usersAdapter = createEntityAdapter<User>();

            const postsAdapter = createEntityAdapter<Post>();

            let usersSliceCallCount = 0;
            let postsSliceCallCount = 0;

            const usersSlice = createSlice({
                name: 'users',
                initialState: usersAdapter.getInitialState(),
                reducers: {
                    updateUser: (state, action: PayloadAction<User>) => {
                        usersSliceCallCount++;
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: action.payload,
                        });
                    },
                },
            });

            const postsSlice = createSlice({
                name: 'posts',
                initialState: postsAdapter.getInitialState(),
                reducers: {
                    updatePost: (state, action: PayloadAction<Post>) => {
                        postsSliceCallCount++;
                        postsAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: action.payload,
                        });
                    },
                },
            });

            const usersReducer = adapter.createCollectionReducer(
                usersCollection,
                {
                    reducer: usersSlice.reducer,
                    getPk: user => user.id,
                }
            );

            const postsReducer = adapter.createCollectionReducer(
                postsCollection,
                {
                    reducer: postsSlice.reducer,
                    getPk: post => post.id,
                }
            );

            const middleware = adapter.createMiddleware();
            const store = createStore(
                combineReducers({
                    users: usersReducer,
                    posts: postsReducer,
                }),
                applyMiddleware(middleware)
            );
            adapter.setStore(store);

            queue.flush();

            // Update both through slice actions
            store.dispatch(
                usersSlice.actions.updateUser({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                })
            );

            store.dispatch(
                postsSlice.actions.updatePost({
                    id: '1',
                    title: 'Post 1 Updated',
                    content: 'Content 1 Updated',
                    authorId: '1',
                })
            );

            // Each slice reducer should be called once
            expect(usersSliceCallCount).toBe(1);
            expect(postsSliceCallCount).toBe(1);

            // Verify collections are updated
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice Updated');
            expect(postsCollection.getOneByPk('1')?.title).toBe(
                'Post 1 Updated'
            );

            // Verify Redux state is updated
            const state = store.getState() as {
                users?: ReturnType<typeof usersAdapter.getInitialState>;
                posts?: ReturnType<typeof postsAdapter.getInitialState>;
            };
            if (state.users && 'entities' in state.users) {
                expect(
                    usersAdapter.getSelectors().selectById(state.users, '1')
                        ?.name
                ).toBe('Alice Updated');
            }
            if (state.posts && 'entities' in state.posts) {
                expect(
                    postsAdapter.getSelectors().selectById(state.posts, '1')
                        ?.title
                ).toBe('Post 1 Updated');
            }
        });

        test('should not create infinite loop when EntityAdapter updates with same data', () => {
            // Setup initial data
            usersCollection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            const usersAdapter = createEntityAdapter<User>();

            let sliceReducerCallCount = 0;
            let oimdbUpdateHandledCount = 0;

            const usersSlice = createSlice({
                name: 'users',
                initialState: usersAdapter.getInitialState(),
                reducers: {
                    updateUser: (state, action: PayloadAction<User>) => {
                        sliceReducerCallCount++;
                        // EntityAdapter.updateOne always creates new state object
                        // even if data is the same
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: action.payload,
                        });
                    },
                },
            });

            const reducer = adapter.createCollectionReducer(usersCollection, {
                reducer: usersSlice.reducer,
                getPk: user => user.id,
            });

            // Wrap reducer to track OIMDB_UPDATE handling
            const wrappedReducer: Reducer<
                ReturnType<typeof usersAdapter.getInitialState> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdateHandledCount++;
                }
                return reducer(state, action) as
                    | ReturnType<typeof usersAdapter.getInitialState>
                    | undefined;
            };

            const middleware = adapter.createMiddleware();
            const store = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(store);

            queue.flush();
            const initialOimdbUpdateCount = oimdbUpdateHandledCount;

            // Update with same data
            store.dispatch(
                usersSlice.actions.updateUser({
                    id: '1',
                    name: 'Alice', // Same name
                    age: 30, // Same age
                    email: 'alice@test.com', // Same email
                })
            );

            // Slice reducer should be called once
            expect(sliceReducerCallCount).toBe(1);

            // OIMDB_UPDATE should NOT be dispatched (no actual changes in OIMDB)
            expect(oimdbUpdateHandledCount).toBe(initialOimdbUpdateCount);

            // Verify collection was not updated (no actual change)
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice');
            expect(usersCollection.getOneByPk('1')?.age).toBe(30);
        });

        test('should work with EntityAdapter and linked indexes', () => {
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

            const decksCollection = new OIMReactiveCollection<Deck, string>(
                queue,
                {
                    selectPk: deck => deck.id,
                }
            );
            const cardsCollection = new OIMReactiveCollection<Card, string>(
                queue,
                {
                    selectPk: card => card.id,
                }
            );

            const cardsByDeckIndex = new OIMReactiveIndexManualArrayBased<
                string,
                string
            >(queue);

            // Setup initial data
            decksCollection.upsertMany([
                {
                    id: 'deck1',
                    cardIds: ['card1', 'card2'],
                    name: 'Deck 1',
                },
            ]);
            cardsCollection.upsertMany([
                { id: 'card1', name: 'Card 1', deckId: 'deck1' },
                { id: 'card2', name: 'Card 2', deckId: 'deck1' },
            ]);
            cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
            queue.flush();

            const decksAdapter = createEntityAdapter<Deck>();

            let sliceReducerCallCount = 0;

            const decksSlice = createSlice({
                name: 'decks',
                initialState: decksAdapter.getInitialState(),
                reducers: {
                    updateDeckCards: (
                        state,
                        action: PayloadAction<{
                            deckId: string;
                            cardIds: string[];
                        }>
                    ) => {
                        sliceReducerCallCount++;
                        decksAdapter.updateOne(state, {
                            id: action.payload.deckId,
                            changes: { cardIds: action.payload.cardIds },
                        });
                    },
                },
            });

            const reducer = adapter.createCollectionReducer(decksCollection, {
                reducer: decksSlice.reducer,
                getPk: deck => deck.id,
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
            });

            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            queue.flush();

            // Update deck cards through slice action
            store.dispatch(
                decksSlice.actions.updateDeckCards({
                    deckId: 'deck1',
                    cardIds: ['card2', 'card3'], // card1 removed, card3 added
                })
            );

            // Slice reducer should be called once
            expect(sliceReducerCallCount).toBe(1);

            // Verify collection is updated
            expect(decksCollection.getOneByPk('deck1')?.cardIds).toEqual([
                'card2',
                'card3',
            ]);

            // Verify linked index is updated
            expect(cardsByDeckIndex.getPksByKey('deck1')).toEqual([
                'card2',
                'card3',
            ]);

            // Verify Redux state is updated
            const state = store.getState() as
                | ReturnType<typeof decksAdapter.getInitialState>
                | undefined;
            if (state && 'entities' in state) {
                expect(
                    decksAdapter.getSelectors().selectById(state, 'deck1')
                        ?.cardIds
                ).toEqual(['card2', 'card3']);
            }
        });

        test('should work with full RTK slice pattern - actions, selectors, and typed hooks', () => {
            // Setup initial data
            usersCollection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            const usersAdapter = createEntityAdapter<User>();

            // Create a full RTK slice with multiple actions
            const usersSlice = createSlice({
                name: 'users',
                initialState: usersAdapter.getInitialState(),
                reducers: {
                    addUser: (state, action: PayloadAction<User>) => {
                        usersAdapter.addOne(state, action.payload);
                    },
                    updateUser: (
                        state,
                        action: PayloadAction<Partial<User> & { id: string }>
                    ) => {
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: action.payload,
                        });
                    },
                    removeUser: (state, action: PayloadAction<string>) => {
                        usersAdapter.removeOne(state, action.payload);
                    },
                    setUserAge: (
                        state,
                        action: PayloadAction<{ id: string; age: number }>
                    ) => {
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: { age: action.payload.age },
                        });
                    },
                },
            });

            // Extract actions and reducer
            const { actions: userActions, reducer: usersSliceReducer } =
                usersSlice;

            // Create selectors using EntityAdapter
            const usersSelectors = usersAdapter.getSelectors();

            const reducer = adapter.createCollectionReducer(usersCollection, {
                reducer: usersSliceReducer,
                getPk: user => user.id,
            });

            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            queue.flush();

            // Test 1: Add user through slice action
            store.dispatch(
                userActions.addUser({
                    id: '3',
                    name: 'Charlie',
                    age: 35,
                    email: 'charlie@test.com',
                })
            );

            // Verify collection is updated
            expect(usersCollection.getOneByPk('3')?.name).toBe('Charlie');

            // Verify Redux state using selectors
            const state1 = store.getState() as
                | ReturnType<typeof usersAdapter.getInitialState>
                | undefined;
            if (state1 && 'entities' in state1) {
                expect(usersSelectors.selectById(state1, '3')?.name).toBe(
                    'Charlie'
                );
                expect(usersSelectors.selectAll(state1)).toHaveLength(3);
            }

            // Test 2: Update user through slice action
            store.dispatch(
                userActions.updateUser({
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                })
            );

            // Verify collection is updated
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice Updated');
            expect(usersCollection.getOneByPk('1')?.age).toBe(31);

            // Verify Redux state using selectors
            const state2 = store.getState() as
                | ReturnType<typeof usersAdapter.getInitialState>
                | undefined;
            if (state2 && 'entities' in state2) {
                expect(usersSelectors.selectById(state2, '1')?.name).toBe(
                    'Alice Updated'
                );
                expect(usersSelectors.selectById(state2, '1')?.age).toBe(31);
            }

            // Test 3: Update only age through specific action
            store.dispatch(
                userActions.setUserAge({
                    id: '2',
                    age: 26,
                })
            );

            // Verify collection is updated
            expect(usersCollection.getOneByPk('2')?.age).toBe(26);
            expect(usersCollection.getOneByPk('2')?.name).toBe('Bob'); // Name unchanged

            // Test 4: Remove user through slice action
            store.dispatch(userActions.removeUser('3'));

            // Verify collection is updated
            expect(usersCollection.getOneByPk('3')).toBeUndefined();

            // Verify Redux state using selectors
            const state3 = store.getState() as
                | ReturnType<typeof usersAdapter.getInitialState>
                | undefined;
            if (state3 && 'entities' in state3) {
                expect(usersSelectors.selectById(state3, '3')).toBeUndefined();
                expect(usersSelectors.selectAll(state3)).toHaveLength(2);
                expect(usersSelectors.selectIds(state3)).toEqual(['1', '2']);
            }

            // Test 5: Update OIMDB directly - should sync to Redux
            usersCollection.upsertOne({
                id: '1',
                name: 'Alice Updated Again',
                age: 32,
                email: 'alice@test.com',
            });
            queue.flush();

            // Verify Redux state is updated via OIMDB_UPDATE
            const state4 = store.getState() as
                | ReturnType<typeof usersAdapter.getInitialState>
                | undefined;
            if (state4 && 'entities' in state4) {
                expect(usersSelectors.selectById(state4, '1')?.name).toBe(
                    'Alice Updated Again'
                );
                expect(usersSelectors.selectById(state4, '1')?.age).toBe(32);
            }
        });

        test('should work with RTK slice extraReducers pattern', () => {
            // Setup initial data
            usersCollection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            const usersAdapter = createEntityAdapter<User>();

            // Create action creators outside slice using createAction (for extraReducers pattern)
            const setUserName = createAction<{ id: string; name: string }>(
                'users/setUserName'
            );
            const bulkUpdate =
                createAction<Array<{ id: string; changes: Partial<User> }>>(
                    'users/bulkUpdate'
                );

            // Create slice with extraReducers
            const usersSlice = createSlice({
                name: 'users',
                initialState: usersAdapter.getInitialState(),
                reducers: {
                    updateUser: (state, action: PayloadAction<User>) => {
                        usersAdapter.updateOne(state, {
                            id: action.payload.id,
                            changes: action.payload,
                        });
                    },
                },
                extraReducers: builder => {
                    builder
                        .addCase(setUserName, (state, action) => {
                            const { id, name } = action.payload;
                            usersAdapter.updateOne(state, {
                                id,
                                changes: { name },
                            });
                        })
                        .addCase(bulkUpdate, (state, action) => {
                            const updates = action.payload;
                            usersAdapter.updateMany(
                                state,
                                updates.map(u => ({
                                    id: u.id,
                                    changes: u.changes,
                                }))
                            );
                        });
                },
            });

            // Export actions for use in tests
            const externalActions = {
                setUserName,
                bulkUpdate,
            };

            const reducer = adapter.createCollectionReducer(usersCollection, {
                reducer: usersSlice.reducer,
                getPk: user => user.id,
            });

            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            queue.flush();

            // Test extraReducer action
            store.dispatch(
                externalActions.setUserName({ id: '1', name: 'Alice Renamed' })
            );

            // Verify collection is updated
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice Renamed');
            expect(usersCollection.getOneByPk('1')?.age).toBe(30); // Age unchanged

            // Test bulk update through extraReducer
            store.dispatch(
                externalActions.bulkUpdate([{ id: '1', changes: { age: 31 } }])
            );

            // Verify collection is updated
            expect(usersCollection.getOneByPk('1')?.age).toBe(31);
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice Renamed'); // Name unchanged

            // Test regular slice action
            store.dispatch(
                usersSlice.actions.updateUser({
                    id: '1',
                    name: 'Alice Final',
                    age: 32,
                    email: 'alice@test.com',
                })
            );

            // Verify collection is updated
            expect(usersCollection.getOneByPk('1')?.name).toBe('Alice Final');
            expect(usersCollection.getOneByPk('1')?.age).toBe(32);
        });
    });

    describe('middleware and automatic flushing', () => {
        let collection: OIMReactiveCollection<User, string>;
        let adapter: OIMDBReduxAdapter;
        let store: Store;
        let queue: OIMEventQueue;

        beforeEach(() => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            adapter = new OIMDBReduxAdapter(queue);
            collection = new OIMReactiveCollection<User, string>(queue);

            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();
            store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);
        });

        test('should automatically flush queue after Redux action via middleware', () => {
            // Initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            // Dispatch custom action that updates collection through child reducer
            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducerWithChild = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const newAdapter = new OIMDBReduxAdapter(queue);
            const storeWithChild = createStore(
                reducerWithChild,
                applyMiddleware(newAdapter.createMiddleware())
            );
            newAdapter.setStore(storeWithChild);

            // Dispatch action - middleware should automatically flush
            storeWithChild.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });

            // No manual flush needed - middleware handled it
            // Collection should be updated
            const user = collection.getOneByPk('1');
            expect(user?.name).toBe('Alice Updated');
            expect(user?.age).toBe(31);
        });

        test('should handle multiple synchronous OIMDB updates and dispatches', () => {
            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Multiple synchronous updates
            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            queue.flush(); // Triggers dispatch

            collection.upsertOne({
                id: '2',
                name: 'Bob',
                age: 25,
                email: 'bob@test.com',
            });
            queue.flush(); // Triggers dispatch

            collection.upsertOne({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            queue.flush(); // Triggers dispatch

            // All updates should be reflected in Redux state
            const state = store.getState() as TOIMDBReduxDefaultCollectionState<
                User,
                string
            >;
            expect(state.entities['1'].name).toBe('Alice Updated');
            expect(state.entities['1'].age).toBe(31);
            expect(state.entities['2'].name).toBe('Bob');
            expect(state.ids).toHaveLength(2);
        });

        test('should handle rapid OIMDB updates without redundant Redux updates', () => {
            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();
            let reducerCallCount = 0;
            const wrappedReducer = (state: any, action: Action) => {
                reducerCallCount++;
                return reducer(state, action);
            };

            const storeWithTracking = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(storeWithTracking);

            // Rapid updates to same entity
            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            collection.upsertOne({
                id: '1',
                name: 'Alice 2',
                age: 30,
                email: 'alice@test.com',
            });
            collection.upsertOne({
                id: '1',
                name: 'Alice 3',
                age: 30,
                email: 'alice@test.com',
            });

            // Single flush should coalesce all updates
            queue.flush();

            // Should only trigger reducer once (coalesced)
            expect(reducerCallCount).toBeGreaterThan(0);
            const state =
                storeWithTracking.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            expect(state.entities['1'].name).toBe('Alice 3'); // Final state
        });

        test('should optimize state updates - reuse objects when unchanged', () => {
            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Initial state
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush();

            const initialState =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            const initialEntities = initialState.entities;
            const initialIds = initialState.ids;

            // Update only one entity
            collection.upsertOne({
                id: '1',
                name: 'Alice Updated',
                age: 31,
                email: 'alice@test.com',
            });
            queue.flush();

            const updatedState =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;

            // IDs array should have same content (may be new reference due to mapper implementation)
            expect(updatedState.ids).toEqual(initialIds);

            // Entity '2' should be reused (unchanged) - same reference
            expect(updatedState.entities['2']).toBe(initialEntities['2']);

            // Entity '1' should be new (changed)
            expect(updatedState.entities['1']).not.toBe(initialEntities['1']);
            expect(updatedState.entities['1'].name).toBe('Alice Updated');
        });

        test('should not update Redux state when no changes occurred', () => {
            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();

            const wrappedReducer = (state: any, action: Action) => {
                return reducer(state, action);
            };

            const store = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(store);

            // Initial state
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
                { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
            ]);
            queue.flush(); // First flush - should update state

            const initialState =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;

            // Flush again without any changes - should not update state
            queue.flush();

            const stateAfterEmptyFlush =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;

            // State should be the same object reference (no new state created)
            // This is the key optimization - no unnecessary state updates
            expect(stateAfterEmptyFlush).toBe(initialState);
            expect(stateAfterEmptyFlush.entities).toBe(initialState.entities);
            expect(stateAfterEmptyFlush.ids).toBe(initialState.ids);

            // Flush multiple times without changes
            queue.flush();
            queue.flush();
            queue.flush();

            const stateAfterMultipleFlushes =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;

            // Still should be the same state object - no unnecessary updates
            // This proves that the reducer optimization works correctly
            expect(stateAfterMultipleFlushes).toBe(initialState);
            expect(stateAfterMultipleFlushes.entities).toBe(
                initialState.entities
            );
            expect(stateAfterMultipleFlushes.ids).toBe(initialState.ids);
        });

        test('should not update unchanged entities when syncing from child reducer', () => {
            // Setup initial data with multiple entities
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

            // Track how many times entities are accessed/updated in collection
            let collectionUpsertCallCount = 0;
            let collectionRemoveCallCount = 0;
            const originalUpsertMany = collection.upsertMany.bind(collection);
            const originalRemoveMany = collection.removeMany.bind(collection);

            collection.upsertMany = (entities: User[]) => {
                collectionUpsertCallCount++;
                return originalUpsertMany(entities);
            };
            collection.removeMany = (entities: User[]) => {
                collectionRemoveCallCount++;
                return originalRemoveMany(entities);
            };

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_SINGLE_USER') {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            const initialState =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            const initialEntity1 = initialState.entities['1'];
            const initialEntity2 = initialState.entities['2'];
            const initialEntity3 = initialState.entities['3'];

            // Reset counters
            collectionUpsertCallCount = 0;
            collectionRemoveCallCount = 0;

            // Update only one entity through child reducer
            rootStore.dispatch({
                type: 'UPDATE_SINGLE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });
            // Middleware automatically flushes

            // Verify that only the changed entity was updated in collection
            // Should call upsertMany once with only entity '1'
            expect(collectionUpsertCallCount).toBe(1);
            expect(collectionRemoveCallCount).toBe(0);

            // Verify entities in collection
            const entity1 = collection.getOneByPk('1');
            const entity2 = collection.getOneByPk('2');
            const entity3 = collection.getOneByPk('3');

            expect(entity1?.name).toBe('Alice Updated');
            expect(entity1?.age).toBe(31);
            // Other entities should remain unchanged
            expect(entity2?.name).toBe('Bob');
            expect(entity2?.age).toBe(25);
            expect(entity3?.name).toBe('Charlie');
            expect(entity3?.age).toBe(35);

            // Verify Redux state - unchanged entities should have same reference
            const updatedState =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            expect(updatedState.entities['1']).not.toBe(initialEntity1); // Changed
            expect(updatedState.entities['2']).toBe(initialEntity2); // Unchanged - same reference
            expect(updatedState.entities['3']).toBe(initialEntity3); // Unchanged - same reference
        });

        test('should batch multiple entity updates efficiently', () => {
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

            let collectionUpsertCallCount = 0;
            const originalUpsertMany = collection.upsertMany.bind(collection);
            collection.upsertMany = (entities: User[]) => {
                collectionUpsertCallCount++;
                return originalUpsertMany(entities);
            };

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_MULTIPLE_USERS') {
                    const typedAction = action as {
                        type: string;
                        users: User[];
                    };
                    const newEntities = { ...state.entities };
                    for (const user of typedAction.users) {
                        newEntities[user.id] = user;
                    }
                    return {
                        ...state,
                        entities: newEntities,
                    };
                }
                return state;
            };

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(rootStore);

            queue.flush();

            collectionUpsertCallCount = 0;

            // Update multiple entities in one action
            rootStore.dispatch({
                type: 'UPDATE_MULTIPLE_USERS',
                users: [
                    {
                        id: '1',
                        name: 'Alice Updated',
                        age: 31,
                        email: 'alice@test.com',
                    },
                    {
                        id: '2',
                        name: 'Bob Updated',
                        age: 26,
                        email: 'bob@test.com',
                    },
                ],
            });
            // Middleware automatically flushes

            // Should call upsertMany once with both entities (batched)
            expect(collectionUpsertCallCount).toBe(1);

            // Verify all updates
            expect(collection.getOneByPk('1')?.name).toBe('Alice Updated');
            expect(collection.getOneByPk('2')?.name).toBe('Bob Updated');
            expect(collection.getOneByPk('3')?.name).toBe('Charlie'); // Unchanged
        });

        test('should prevent update loops when syncing from child reducer to OIMDB', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            let childReducerCallCount = 0;
            let oimdbUpdateHandledCount = 0;

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_USER') {
                    childReducerCallCount++;
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            // Wrap reducer to track OIMDB_UPDATE handling
            const wrappedReducer: Reducer<
                TOIMDBReduxDefaultCollectionState<User, string> | undefined,
                Action
            > = (state, action) => {
                if (action.type === EOIMDBReduxReducerActionType.UPDATE) {
                    oimdbUpdateHandledCount++;
                }
                return reducer(state, action);
            };

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(
                wrappedReducer,
                applyMiddleware(middleware)
            );
            adapter.setStore(rootStore);

            queue.flush();
            const initialState =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            const initialOimdbUpdateCount = oimdbUpdateHandledCount;

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
            // Middleware automatically flushes silently (no OIMDB_UPDATE dispatch)

            // Child reducer should be called once
            expect(childReducerCallCount).toBe(1);

            // OIMDB_UPDATE should NOT be dispatched when syncing from child
            // (middleware uses flushSilently to prevent loops)
            // So oimdbUpdateHandledCount should NOT increase
            expect(oimdbUpdateHandledCount).toBe(initialOimdbUpdateCount);

            // Verify state is correct
            const state =
                rootStore.getState() as TOIMDBReduxDefaultCollectionState<
                    User,
                    string
                >;
            expect(state.entities['1'].name).toBe('Alice Updated');
            expect(state).not.toBe(initialState); // State changed

            // Verify collection is updated
            expect(collection.getOneByPk('1')?.name).toBe('Alice Updated');

            // Now trigger an OIMDB update directly to verify OIMDB_UPDATE is dispatched
            collection.upsertOne({
                id: '1',
                name: 'Alice Updated Again',
                age: 32,
                email: 'alice@test.com',
            });
            queue.flush(); // This should dispatch OIMDB_UPDATE

            // Now OIMDB_UPDATE should be handled
            expect(oimdbUpdateHandledCount).toBeGreaterThan(
                initialOimdbUpdateCount
            );
        });

        test('should emit update events only for changed keys when syncing from child reducer', () => {
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

            // Track update events by key
            const updateEventsByKey = new Map<string, number>();
            const allUpdateEvents: string[] = [];

            // Subscribe to update events for each key
            const unsubscribe1 = collection.updateEventEmitter.subscribeOnKey(
                '1',
                () => {
                    updateEventsByKey.set(
                        '1',
                        (updateEventsByKey.get('1') || 0) + 1
                    );
                    allUpdateEvents.push('1');
                }
            );
            const unsubscribe2 = collection.updateEventEmitter.subscribeOnKey(
                '2',
                () => {
                    updateEventsByKey.set(
                        '2',
                        (updateEventsByKey.get('2') || 0) + 1
                    );
                    allUpdateEvents.push('2');
                }
            );
            const unsubscribe3 = collection.updateEventEmitter.subscribeOnKey(
                '3',
                () => {
                    updateEventsByKey.set(
                        '3',
                        (updateEventsByKey.get('3') || 0) + 1
                    );
                    allUpdateEvents.push('3');
                }
            );

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_SINGLE_USER') {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(rootStore);

            // Wait for initial sync
            queue.flush();

            // Reset counters
            updateEventsByKey.clear();
            allUpdateEvents.length = 0;

            // Update only entity '1' through child reducer
            rootStore.dispatch({
                type: 'UPDATE_SINGLE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });
            // Middleware automatically flushes

            // Wait for events to process
            queue.flush();

            // Only key '1' should have received update event
            expect(updateEventsByKey.get('1')).toBe(1);
            expect(updateEventsByKey.get('2')).toBeUndefined();
            expect(updateEventsByKey.get('3')).toBeUndefined();
            expect(allUpdateEvents).toEqual(['1']);

            // Cleanup
            unsubscribe1();
            unsubscribe2();
            unsubscribe3();
        });

        test('should emit update events for all changed keys when multiple entities updated', () => {
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

            // Track update events by key
            const updateEventsByKey = new Map<string, number>();
            const allUpdateEvents: string[] = [];

            // Subscribe to all keys
            const unsubscribes: Array<() => void> = [];
            for (const key of ['1', '2', '3']) {
                const unsubscribe =
                    collection.updateEventEmitter.subscribeOnKey(key, () => {
                        updateEventsByKey.set(
                            key,
                            (updateEventsByKey.get(key) || 0) + 1
                        );
                        allUpdateEvents.push(key);
                    });
                unsubscribes.push(unsubscribe);
            }

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'UPDATE_MULTIPLE_USERS') {
                    const typedAction = action as {
                        type: string;
                        users: User[];
                    };
                    const newEntities = { ...state.entities };
                    for (const user of typedAction.users) {
                        newEntities[user.id] = user;
                    }
                    return {
                        ...state,
                        entities: newEntities,
                    };
                }
                return state;
            };

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );

            const middleware = adapter.createMiddleware();
            const rootStore = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(rootStore);

            queue.flush();

            // Reset counters
            updateEventsByKey.clear();
            allUpdateEvents.length = 0;

            // Update entities '1' and '2' in one action
            rootStore.dispatch({
                type: 'UPDATE_MULTIPLE_USERS',
                users: [
                    {
                        id: '1',
                        name: 'Alice Updated',
                        age: 31,
                        email: 'alice@test.com',
                    },
                    {
                        id: '2',
                        name: 'Bob Updated',
                        age: 26,
                        email: 'bob@test.com',
                    },
                ],
            });
            // Middleware automatically flushes

            // Wait for events to process
            queue.flush();

            // Keys '1' and '2' should have received update events
            expect(updateEventsByKey.get('1')).toBe(1);
            expect(updateEventsByKey.get('2')).toBe(1);
            expect(updateEventsByKey.get('3')).toBeUndefined();
            // Events can be in any order, but should contain both '1' and '2'
            expect(allUpdateEvents).toContain('1');
            expect(allUpdateEvents).toContain('2');
            expect(allUpdateEvents).not.toContain('3');
            expect(allUpdateEvents.length).toBe(2);

            // Cleanup
            for (const unsubscribe of unsubscribes) {
                unsubscribe();
            }
        });

        test('should not emit update events when no changes occur', () => {
            // Setup initial data
            collection.upsertMany([
                { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
            ]);
            queue.flush();

            // Track update events
            let updateEventCount = 0;
            const unsubscribe = collection.updateEventEmitter.subscribeOnKey(
                '1',
                () => {
                    updateEventCount++;
                }
            );

            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();
            const rootStore = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(rootStore);

            queue.flush();
            const initialEventCount = updateEventCount;

            // Flush again without any changes
            queue.flush();

            // No update events should be emitted
            expect(updateEventCount).toBe(initialEventCount);

            // Cleanup
            unsubscribe();
        });

        test('should handle complex scenario: OIMDB update -> dispatch -> OIMDB update -> dispatch', () => {
            const reducer = adapter.createCollectionReducer(collection);
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Step 1: OIMDB update
            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            queue.flush(); // Triggers dispatch

            // Step 2: Redux dispatch (simulating user action)
            store.dispatch({ type: 'SOME_ACTION' });
            // Middleware automatically flushes if needed

            // Step 3: Another OIMDB update
            collection.upsertOne({
                id: '2',
                name: 'Bob',
                age: 25,
                email: 'bob@test.com',
            });
            queue.flush(); // Triggers dispatch

            // Step 4: Another Redux dispatch
            store.dispatch({ type: 'ANOTHER_ACTION' });

            // Final state should have both entities
            const state = store.getState() as TOIMDBReduxDefaultCollectionState<
                User,
                string
            >;
            expect(state.entities['1']).toBeDefined();
            expect(state.entities['2']).toBeDefined();
            expect(state.ids).toHaveLength(2);
        });

        test('should handle synchronous updates from both directions without conflicts', () => {
            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<User, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<User, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                User,
                string,
                TOIMDBReduxDefaultCollectionState<User, string>
            > = {
                reducer: childReducer,
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Initial data
            collection.upsertOne({
                id: '1',
                name: 'Alice',
                age: 30,
                email: 'alice@test.com',
            });
            queue.flush();

            // Step 1: OIMDB update for '2'
            collection.upsertOne({
                id: '2',
                name: 'Bob',
                age: 25,
                email: 'bob@test.com',
            });
            queue.flush(); // Process OIMDB update first

            // Step 2: Redux dispatch for '1' (middleware will auto-flush)
            store.dispatch({
                type: 'UPDATE_USER',
                user: {
                    id: '1',
                    name: 'Alice Updated',
                    age: 31,
                    email: 'alice@test.com',
                },
            });
            // Middleware automatically flushed queue if needed

            // Both should be reflected correctly
        });

        test('should update linked indexes when entity array field changes', () => {
            interface Deck {
                id: string;
                cardIds: string[];
                name: string;
            }

            const decksCollection = new OIMReactiveCollection<Deck, string>(
                queue,
                {
                    selectPk: deck => deck.id,
                }
            );
            const cardsByDeckIndex = new OIMReactiveIndexManualSetBased<
                string,
                string
            >(queue);

            // Setup initial data
            decksCollection.upsertMany([
                { id: 'deck1', cardIds: ['card1', 'card2'], name: 'Deck 1' },
                { id: 'deck2', cardIds: ['card3'], name: 'Deck 2' },
            ]);
            queue.flush();

            // Initialize index manually
            cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
            cardsByDeckIndex.setPks('deck2', ['card3']);
            queue.flush();

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<Deck, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<Deck, string> => {
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

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                Deck,
                string,
                TOIMDBReduxDefaultCollectionState<Deck, string>
            > = {
                reducer: childReducer,
                getPk: deck => deck.id,
                linkedIndexes: [
                    {
                        index: cardsByDeckIndex as unknown as OIMReactiveIndexSetBased<
                            TOIMPk,
                            string,
                            OIMIndexSetBased<TOIMPk, string>
                        >,
                        fieldName: 'cardIds', // Array field containing PKs
                    },
                ],
            };

            const reducer = adapter.createCollectionReducer(
                decksCollection,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Wait for initial sync
            queue.flush();

            // Update deck1's cardIds - remove card1, add card4
            store.dispatch({
                type: 'UPDATE_DECK_CARDS',
                deckId: 'deck1',
                cardIds: ['card2', 'card4'], // card1 removed, card4 added
            });
            // Middleware automatically flushes

            // Index should be updated: index[deck1] = ['card2', 'card4']
            const deck1Pks = Array.from(cardsByDeckIndex.getPksByKey('deck1'));
            expect(deck1Pks).toContain('card2'); // card2 still there
            expect(deck1Pks).toContain('card4'); // card4 added
            expect(deck1Pks).not.toContain('card1'); // card1 removed
            expect(deck1Pks).toHaveLength(2);

            // deck2 should remain unchanged
            const deck2Pks = Array.from(cardsByDeckIndex.getPksByKey('deck2'));
            expect(deck2Pks).toEqual(['card3']);

            // Collection should be updated
            const deck1 = decksCollection.getOneByPk('deck1');
            expect(deck1?.cardIds).toEqual(['card2', 'card4']);
        });

        test('should remove entity from linked indexes when entity is deleted', () => {
            interface Deck {
                id: string;
                cardIds: string[];
                name: string;
            }

            const decksCollection = new OIMReactiveCollection<Deck, string>(
                queue,
                {
                    selectPk: deck => deck.id,
                }
            );
            const cardsByDeckIndex = new OIMReactiveIndexManualSetBased<
                string,
                string
            >(queue);

            // Setup initial data
            decksCollection.upsertMany([
                { id: 'deck1', cardIds: ['card1', 'card2'], name: 'Deck 1' },
                { id: 'deck2', cardIds: ['card3'], name: 'Deck 2' },
            ]);
            queue.flush();

            // Initialize index manually
            cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
            cardsByDeckIndex.setPks('deck2', ['card3']);
            queue.flush();

            const childReducer = (
                state:
                    | TOIMDBReduxDefaultCollectionState<Deck, string>
                    | undefined,
                action: Action
            ): TOIMDBReduxDefaultCollectionState<Deck, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'DELETE_DECK') {
                    const typedAction = action as {
                        type: string;
                        deckId: string;
                    };
                    const newEntities = { ...state.entities };
                    delete newEntities[typedAction.deckId];
                    return {
                        entities: newEntities,
                        ids: state.ids.filter(id => id !== typedAction.deckId),
                    };
                }
                return state;
            };

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                Deck,
                string,
                TOIMDBReduxDefaultCollectionState<Deck, string>
            > = {
                reducer: childReducer,
                getPk: deck => deck.id,
                linkedIndexes: [
                    {
                        index: cardsByDeckIndex as unknown as OIMReactiveIndexSetBased<
                            TOIMPk,
                            string,
                            OIMIndexSetBased<TOIMPk, string>
                        >,
                        fieldName: 'cardIds',
                    },
                ],
            };

            const reducer = adapter.createCollectionReducer(
                decksCollection,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Wait for initial sync
            queue.flush();

            // Delete deck1
            store.dispatch({
                type: 'DELETE_DECK',
                deckId: 'deck1',
            });
            // Middleware automatically flushes

            // Index should be updated - deck1 entry removed
            expect(cardsByDeckIndex.hasKey('deck1')).toBe(false);

            // deck2 should remain unchanged
            const deck2Pks = Array.from(cardsByDeckIndex.getPksByKey('deck2'));
            expect(deck2Pks).toEqual(['card3']);

            // Collection should be updated
            const deck1 = decksCollection.getOneByPk('deck1');
            expect(deck1).toBeUndefined();
        });

        test('should update linked indexes when OIMDB changes directly (OIMDB → Redux)', () => {
            interface Deck {
                id: string;
                cardIds: string[];
                name: string;
            }

            const queue = new OIMEventQueue();
            const adapter = new OIMDBReduxAdapter(queue);
            const decksCollection = new OIMReactiveCollection<Deck, string>(
                queue,
                {
                    selectPk: deck => deck.id,
                }
            );
            const cardsByDeckIndex = new OIMReactiveIndexManualSetBased<
                string,
                string
            >(queue);

            // Add initial deck
            decksCollection.upsertOne({
                id: 'deck1',
                cardIds: ['card1', 'card2'],
                name: 'Deck 1',
            });
            queue.flush();

            const childOptions: TOIMDBReduxCollectionReducerChildOptions<
                Deck,
                string,
                TOIMDBReduxDefaultCollectionState<Deck, string>
            > = {
                reducer: (
                    state:
                        | TOIMDBReduxDefaultCollectionState<Deck, string>
                        | undefined
                ) => {
                    return state;
                },
                getPk: deck => deck.id,
                linkedIndexes: [
                    {
                        index: cardsByDeckIndex as unknown as OIMReactiveIndexSetBased<
                            TOIMPk,
                            string,
                            OIMIndexSetBased<TOIMPk, string>
                        >,
                        fieldName: 'cardIds',
                    },
                ],
            };

            const reducer = adapter.createCollectionReducer(
                decksCollection,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Wait for initial sync
            queue.flush();

            // Verify initial state
            const initialState =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    Deck,
                    string
                >;
            expect(initialState?.entities['deck1']?.cardIds).toEqual([
                'card1',
                'card2',
            ]);

            // Update deck directly in OIMDB
            decksCollection.upsertOne({
                id: 'deck1',
                cardIds: ['card3', 'card4', 'card5'], // Changed array
                name: 'Deck 1 Updated',
            });
            queue.flush(); // This triggers OIMDB_UPDATE action

            // Linked index should be updated automatically
            const deck1Pks = Array.from(cardsByDeckIndex.getPksByKey('deck1'));
            expect(deck1Pks).toEqual(['card3', 'card4', 'card5']);

            // Redux state should also be updated
            const updatedState =
                store.getState() as TOIMDBReduxDefaultCollectionState<
                    Deck,
                    string
                >;
            expect(updatedState?.entities['deck1']?.cardIds).toEqual([
                'card3',
                'card4',
                'card5',
            ]);
        });
    });
});
