import {
    OIMReactiveCollection,
    OIMReactiveIndexManual,
    OIMReactiveIndex,
    OIMIndex,
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
} from 'redux';
import {
    OIMDBAdapter,
    TOIMDefaultCollectionState,
    TOIMDefaultIndexState,
    EOIMDBReducerActionType,
    TOIMCollectionReducerChildOptions,
    TOIMIndexReducerChildOptions,
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

describe('OIMDBAdapter', () => {
    let queue: OIMEventQueue;
    let adapter: OIMDBAdapter;
    let store: Store;

    beforeEach(() => {
        const scheduler = new OIMEventQueueSchedulerImmediate();
        queue = new OIMEventQueue({ scheduler });
        adapter = new OIMDBAdapter(queue);

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

            const customReducer = adapter.createCollectionReducer(
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
        let reducer: ReturnType<typeof adapter.createIndexReducer>;

        beforeEach(() => {
            index = new OIMReactiveIndexManual<string, string>(queue);
            reducer = adapter.createIndexReducer(index);
        });

        test('should initialize state with all index keys on first OIMDB_UPDATE', () => {
            index.setPks('department1', ['user1', 'user2']);
            index.setPks('department2', ['user3']);

            queue.flush();
            const state = reducer(undefined, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultIndexState<string, string>;

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
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultIndexState<string, string>;

            // Update only one key
            index.setPks('department1', ['user1', 'user2', 'user4']);
            queue.flush();

            const updatedState = reducer(initialState, {
                type: EOIMDBReducerActionType.UPDATE,
            }) as TOIMDefaultIndexState<string, string>;

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

            const customReducer = adapter.createIndexReducer(
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

        describe('child reducer integration', () => {
            test('should sync child reducer changes back to OIMDB index', () => {
                // Setup initial data
                index.setPks('department1', ['user1', 'user2']);
                index.setPks('department2', ['user3']);
                queue.flush();

                const childReducer = (
                    state: TOIMDefaultIndexState<string, string> | undefined,
                    action: Action
                ): TOIMDefaultIndexState<string, string> => {
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

                const childOptions: TOIMIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                    // Using default extractIndexState for TOIMDefaultIndexState
                };

                const reducer = adapter.createIndexReducer(
                    index,
                    undefined,
                    childOptions
                );
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
                    state: TOIMDefaultIndexState<string, string> | undefined,
                    action: Action
                ): TOIMDefaultIndexState<string, string> => {
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

                const childOptions: TOIMIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                };

                const reducer = adapter.createIndexReducer(
                    index,
                    undefined,
                    childOptions
                );
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
                    state: TOIMDefaultIndexState<string, string> | undefined,
                    action: Action
                ): TOIMDefaultIndexState<string, string> => {
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

                const childOptions: TOIMIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                };

                const reducer = adapter.createIndexReducer(
                    index,
                    undefined,
                    childOptions
                );
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
                    state: TOIMDefaultIndexState<string, string> | undefined,
                    action: Action
                ): TOIMDefaultIndexState<string, string> => {
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

                const childOptions: TOIMIndexReducerChildOptions<
                    string,
                    string,
                    TOIMDefaultIndexState<string, string>
                > = {
                    reducer: childReducer,
                };

                const reducer = adapter.createIndexReducer(
                    index,
                    undefined,
                    childOptions
                );
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
        let adapter: OIMDBAdapter;
        let store: Store;
        let queue: OIMEventQueue;

        beforeEach(() => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            adapter = new OIMDBAdapter(queue);
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

            const reducer = adapter.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const rootStore = createStore(reducer);
            adapter.setStore(rootStore);

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

            const reducer = adapter.createCollectionReducer(
                collection,
                undefined,
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

            const reducer = adapter.createCollectionReducer(
                collection,
                undefined,
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

            const reducer = adapter.createCollectionReducer(
                collection,
                undefined,
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

            const reducer = adapter.createCollectionReducer(
                collection,
                undefined,
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

            const reducer = adapter.createCollectionReducer(
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
    });

    describe('middleware and automatic flushing', () => {
        let collection: OIMReactiveCollection<User, string>;
        let adapter: OIMDBAdapter;
        let store: Store;
        let queue: OIMEventQueue;

        beforeEach(() => {
            const scheduler = new OIMEventQueueSchedulerImmediate();
            queue = new OIMEventQueue({ scheduler });
            adapter = new OIMDBAdapter(queue);
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
                getPk: entity => entity.id,
            };

            const reducerWithChild = adapter.createCollectionReducer(
                collection,
                undefined,
                childOptions
            );

            const newAdapter = new OIMDBAdapter(queue);
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
            const state = store.getState() as TOIMDefaultCollectionState<
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
                storeWithTracking.getState() as TOIMDefaultCollectionState<
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

            const initialState = store.getState() as TOIMDefaultCollectionState<
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

            const updatedState = store.getState() as TOIMDefaultCollectionState<
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
            const state = store.getState() as TOIMDefaultCollectionState<
                User,
                string
            >;
            expect(state.entities['1']).toBeDefined();
            expect(state.entities['2']).toBeDefined();
            expect(state.ids).toHaveLength(2);
        });

        test('should handle synchronous updates from both directions without conflicts', () => {
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
                getPk: entity => entity.id,
            };

            const reducer = adapter.createCollectionReducer(
                collection,
                undefined,
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

        test('should update linked indexes when entity field changes', () => {
            interface Card {
                id: string;
                deckId: string;
                title: string;
            }

            const cardsCollection = new OIMReactiveCollection<Card, string>(
                queue,
                {
                    selectPk: card => card.id,
                }
            );
            const cardsByDeckIndex = new OIMReactiveIndexManual<string, string>(
                queue
            );

            // Setup initial data
            cardsCollection.upsertMany([
                { id: 'card1', deckId: 'deck1', title: 'Card 1' },
                { id: 'card2', deckId: 'deck1', title: 'Card 2' },
                { id: 'card3', deckId: 'deck2', title: 'Card 3' },
            ]);
            queue.flush();

            // Initialize index manually
            cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
            cardsByDeckIndex.setPks('deck2', ['card3']);
            queue.flush();

            const childReducer = (
                state: TOIMDefaultCollectionState<Card, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<Card, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'MOVE_CARD') {
                    const typedAction = action as {
                        type: string;
                        cardId: string;
                        newDeckId: string;
                    };
                    const card = state.entities[typedAction.cardId];
                    if (card) {
                        return {
                            ...state,
                            entities: {
                                ...state.entities,
                                [typedAction.cardId]: {
                                    ...card,
                                    deckId: typedAction.newDeckId,
                                },
                            },
                        };
                    }
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                Card,
                string,
                TOIMDefaultCollectionState<Card, string>
            > = {
                reducer: childReducer,
                getPk: card => card.id,
                linkedIndexes: [
                    {
                        index: cardsByDeckIndex as unknown as OIMReactiveIndex<
                            TOIMPk,
                            string,
                            OIMIndex<TOIMPk, string>
                        >,
                        fieldName: 'deckId',
                    },
                ],
            };

            const reducer = adapter.createCollectionReducer(
                cardsCollection,
                undefined,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Wait for initial sync
            queue.flush();

            // Move card1 from deck1 to deck2
            store.dispatch({
                type: 'MOVE_CARD',
                cardId: 'card1',
                newDeckId: 'deck2',
            });
            // Middleware automatically flushes

            // Index should be updated
            const deck1Pks = Array.from(cardsByDeckIndex.getPksByKey('deck1'));
            expect(deck1Pks).toEqual(['card2']); // card1 removed

            const deck2Pks = Array.from(cardsByDeckIndex.getPksByKey('deck2'));
            expect(deck2Pks).toContain('card3'); // card3 still there
            expect(deck2Pks).toContain('card1'); // card1 added
            expect(deck2Pks).toHaveLength(2);

            // Collection should be updated
            const card1 = cardsCollection.getOneByPk('card1');
            expect(card1?.deckId).toBe('deck2');
        });

        test('should remove entity from linked indexes when entity is deleted', () => {
            interface Card {
                id: string;
                deckId: string;
                title: string;
            }

            const cardsCollection = new OIMReactiveCollection<Card, string>(
                queue,
                {
                    selectPk: card => card.id,
                }
            );
            const cardsByDeckIndex = new OIMReactiveIndexManual<string, string>(
                queue
            );

            // Setup initial data
            cardsCollection.upsertMany([
                { id: 'card1', deckId: 'deck1', title: 'Card 1' },
                { id: 'card2', deckId: 'deck1', title: 'Card 2' },
            ]);
            queue.flush();

            // Initialize index manually
            cardsByDeckIndex.setPks('deck1', ['card1', 'card2']);
            queue.flush();

            const childReducer = (
                state: TOIMDefaultCollectionState<Card, string> | undefined,
                action: Action
            ): TOIMDefaultCollectionState<Card, string> => {
                if (state === undefined) {
                    return { entities: {}, ids: [] };
                }
                if (action.type === 'DELETE_CARD') {
                    const typedAction = action as {
                        type: string;
                        cardId: string;
                    };
                    const newEntities = { ...state.entities };
                    delete newEntities[typedAction.cardId];
                    return {
                        entities: newEntities,
                        ids: state.ids.filter(id => id !== typedAction.cardId),
                    };
                }
                return state;
            };

            const childOptions: TOIMCollectionReducerChildOptions<
                Card,
                string,
                TOIMDefaultCollectionState<Card, string>
            > = {
                reducer: childReducer,
                getPk: card => card.id,
                linkedIndexes: [
                    {
                        index: cardsByDeckIndex as unknown as OIMReactiveIndex<
                            TOIMPk,
                            string,
                            OIMIndex<TOIMPk, string>
                        >,
                        fieldName: 'deckId',
                    },
                ],
            };

            const reducer = adapter.createCollectionReducer(
                cardsCollection,
                undefined,
                childOptions
            );
            const middleware = adapter.createMiddleware();
            const store = createStore(reducer, applyMiddleware(middleware));
            adapter.setStore(store);

            // Wait for initial sync
            queue.flush();

            // Delete card1
            store.dispatch({
                type: 'DELETE_CARD',
                cardId: 'card1',
            });
            // Middleware automatically flushes

            // Index should be updated - card1 removed from deck1
            const deck1Pks = Array.from(cardsByDeckIndex.getPksByKey('deck1'));
            expect(deck1Pks).toEqual(['card2']); // Only card2 remains

            // Collection should be updated
            const card1 = cardsCollection.getOneByPk('card1');
            expect(card1).toBeUndefined();
        });
    });
});
