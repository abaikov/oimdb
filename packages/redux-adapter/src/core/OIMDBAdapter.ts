import {
    OIMReactiveCollection,
    OIMReactiveIndex,
    OIMIndex,
    OIMEventQueue,
    EOIMUpdateEventCoalescerEventType,
    EOIMEventQueueEventType,
    TOIMPk,
} from '@oimdb/core';
import { Store, Reducer, Action, Middleware } from 'redux';
import { EOIMDBReducerActionType } from '../enum/EOIMDBReducerActionType';
import { TOIMDBAdapterOptions } from '../types/TOIMDBAdapterOptions';
import { TOIMCollectionMapper } from '../types/TOIMCollectionMapper';
import { TOIMIndexMapper } from '../types/TOIMIndexMapper';
import { TOIMCollectionReducerChildOptions } from '../types/TOIMCollectionReducerChildOptions';
import {
    defaultCollectionMapper,
    defaultIndexMapper,
} from './OIMDefaultMappers';
import { findUpdatedInRecord } from '../utils/findUpdatedEntities';
import { TOIMDefaultCollectionState } from '../types/TOIMDefaultCollectionState';

/**
 * OIMDB Update Action
 */
export type OIMDBUpdateAction = {
    type: EOIMDBReducerActionType.UPDATE;
};

/**
 * Adapter for integrating OIMDB with Redux.
 * Creates Redux reducers from OIMDB collections and indexes, and provides middleware
 * for automatic event queue flushing.
 */
export class OIMDBAdapter {
    private store?: Store;
    private readonly queue: OIMEventQueue;
    private readonly options: TOIMDBAdapterOptions;
    private queueFlushHandler?: () => void;

    // Track reducers and their updated keys
    // Using object and TOIMPk as base types to allow storing different concrete types
    private collectionReducers = new Map<
        OIMReactiveCollection<object, TOIMPk>,
        {
            updatedKeys: Set<TOIMPk> | null;
            mapper?: TOIMCollectionMapper<object, TOIMPk, unknown>;
        }
    >();

    private indexReducers = new Map<
        OIMReactiveIndex<TOIMPk, TOIMPk, OIMIndex<TOIMPk, TOIMPk>>,
        {
            updatedKeys: Set<TOIMPk> | null;
            mapper?: TOIMIndexMapper<TOIMPk, TOIMPk, unknown>;
        }
    >();

    constructor(queue: OIMEventQueue, options?: TOIMDBAdapterOptions) {
        this.queue = queue;
        this.options = options ?? {};

        // Subscribe to queue flush to dispatch action
        // Use AFTER_FLUSH so that coalescers have already collected updatedKeys
        this.queueFlushHandler = () => {
            if (this.store) {
                this.store.dispatch({
                    type: EOIMDBReducerActionType.UPDATE,
                });
            }
        };
        this.queue.emitter.on(
            EOIMEventQueueEventType.AFTER_FLUSH,
            this.queueFlushHandler
        );
    }

    /**
     * Set Redux store (can be called later when store is created)
     */
    public setStore(store: Store): void {
        this.store = store;
    }

    /**
     * Flush the event queue without triggering OIMDB_UPDATE dispatch.
     * Useful for processing events that were triggered by Redux actions
     * (e.g., through child reducers) without causing unnecessary Redux updates.
     */
    public flushSilently(): void {
        if (this.queueFlushHandler) {
            // Temporarily remove handler to prevent dispatch
            this.queue.emitter.off(
                EOIMEventQueueEventType.AFTER_FLUSH,
                this.queueFlushHandler
            );
        }

        // Flush the queue
        this.queue.flush();

        // Restore handler
        if (this.queueFlushHandler) {
            this.queue.emitter.on(
                EOIMEventQueueEventType.AFTER_FLUSH,
                this.queueFlushHandler
            );
        }
    }

    /**
     * Create Redux middleware that automatically flushes the event queue
     * after every action. This ensures that when Redux updates OIMDB collections
     * through child reducers, all events are processed synchronously.
     *
     * @returns Redux middleware
     *
     * @example
     * ```typescript
     * import { createStore, applyMiddleware } from 'redux';
     * import { OIMDBAdapter } from '@oimdb/redux-adapter';
     *
     * const adapter = new OIMDBAdapter(queue);
     * const middleware = adapter.createMiddleware();
     *
     * const store = createStore(
     *     rootReducer,
     *     applyMiddleware(middleware)
     * );
     *
     * adapter.setStore(store);
     * ```
     */
    public createMiddleware(): Middleware {
        return (store) => (next) => (action) => {
            // Execute the action first
            const result = next(action);

            // Silently flush the queue to process any events triggered by the action
            // This ensures that when child reducers update OIMDB collections,
            // all events are processed synchronously without triggering OIMDB_UPDATE
            this.flushSilently();

            return result;
        };
    }

    /**
     * Create Redux reducer for a collection
     * @param collection - The reactive collection
     * @param mapper - Optional mapper for converting OIMDB state to Redux state
     * @param child - Optional child reducer that handles custom actions and syncs changes back to OIMDB
     */
    public createCollectionReducer<
        TEntity extends object,
        TPk extends TOIMPk,
        TState,
    >(
        collection: OIMReactiveCollection<TEntity, TPk>,
        mapper?: TOIMCollectionMapper<TEntity, TPk, TState>,
        child?: TOIMCollectionReducerChildOptions<TEntity, TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            this.options.defaultCollectionMapper ??
            (defaultCollectionMapper as TOIMCollectionMapper<
                TEntity,
                TPk,
                TState
            >);

        // Track updated keys
        const reducerData = {
            updatedKeys: null as Set<TPk> | null,
            mapper: actualMapper,
        };
        this.collectionReducers.set(
            collection as unknown as OIMReactiveCollection<object, TOIMPk>,
            reducerData as {
                updatedKeys: Set<TOIMPk> | null;
                mapper?: TOIMCollectionMapper<object, TOIMPk, unknown>;
            }
        );

        // Subscribe to BEFORE_FLUSH from coalescer
        const beforeFlushHandler = () => {
            const updatedKeys = collection.coalescer.getUpdatedKeys();
            reducerData.updatedKeys = updatedKeys;
        };
        collection.coalescer.emitter.on(
            EOIMUpdateEventCoalescerEventType.BEFORE_FLUSH,
            beforeFlushHandler
        );

        // Track if we're syncing from child reducer to prevent loops
        let isSyncingFromChild = false;

        // Create reducer function
        const reducer: Reducer<TState | undefined, Action> = (
            state: TState | undefined,
            action: Action
        ) => {
            // Initialize state if undefined (required by Redux combineReducers)
            if (state === undefined) {
                // Get all PKs for initialization
                const allPks = new Set(collection.getAllPks());
                return actualMapper(collection, allPks, undefined);
            }

            // Handle OIMDB_UPDATE action (from OIMDB to Redux)
            if (action.type === EOIMDBReducerActionType.UPDATE) {
                // If we're syncing from child, skip to prevent loops
                if (isSyncingFromChild) {
                    return state;
                }

                // If no updates, return state unchanged
                if (reducerData.updatedKeys === null) {
                    return state;
                }

                // Create new state using mapper
                const updatedKeys = reducerData.updatedKeys;
                const newState = actualMapper(
                    collection,
                    updatedKeys,
                    state as TState | undefined
                );

                // Clear updated keys
                reducerData.updatedKeys = null;

                return newState;
            }

            // Handle other actions with child reducer (if provided)
            if (child) {
                // Pass action to child reducer
                const childState = child.reducer(state, action);

                // If state changed, sync back to OIMDB
                if (childState !== state && childState !== undefined) {
                    // Get PK extractor
                    const getPk =
                        child.getPk ??
                        ((entity: TEntity): TPk => {
                            // Try to get PK from entity (assuming it has id or similar)
                            const entityAny = entity as unknown as Record<
                                string,
                                unknown
                            >;
                            if ('id' in entityAny) {
                                return entityAny.id as TPk;
                            }
                            throw new Error(
                                'Cannot determine primary key. Provide getPk in child options'
                            );
                        });

                    // Use custom extractEntities or default implementation
                    if (child.extractEntities) {
                        // Custom extraction function - user handles everything
                        isSyncingFromChild = true;
                        try {
                            child.extractEntities(
                                state as TState | undefined,
                                childState as TState,
                                collection,
                                getPk
                            );
                        } finally {
                            isSyncingFromChild = false;
                        }
                    } else {
                        // Default implementation for TOIMDefaultCollectionState
                        const defaultState =
                            childState as unknown as TOIMDefaultCollectionState<
                                TEntity,
                                TPk
                            >;
                        if (
                            defaultState &&
                            typeof defaultState === 'object' &&
                            'entities' in defaultState &&
                            'ids' in defaultState
                        ) {
                            // Get current entities from OIMDB for comparison
                            const currentPks = collection.getAllPks();
                            const oldEntities: Record<TPk, TEntity> =
                                Object.create(null) as Record<TPk, TEntity>;
                            for (let i = 0; i < currentPks.length; i++) {
                                const pk = currentPks[i];
                                const entity = collection.getOneByPk(pk);
                                if (entity) {
                                    oldEntities[pk] = entity;
                                }
                            }

                            // Find differences
                            const diff = findUpdatedInRecord(
                                oldEntities,
                                defaultState.entities
                            );

                            // Sync changes to OIMDB
                            isSyncingFromChild = true;
                            try {
                                // Upsert added and updated entities
                                const addedArray = Array.from(diff.added);
                                const updatedArray = Array.from(diff.updated);
                                const entitiesToUpsert: TEntity[] = [];
                                const addedLength = addedArray.length;
                                const updatedLength = updatedArray.length;

                                for (let i = 0; i < addedLength; i++) {
                                    const pk = addedArray[i];
                                    if (defaultState.entities[pk]) {
                                        entitiesToUpsert.push(
                                            defaultState.entities[pk]
                                        );
                                    }
                                }
                                for (let i = 0; i < updatedLength; i++) {
                                    const pk = updatedArray[i];
                                    if (defaultState.entities[pk]) {
                                        entitiesToUpsert.push(
                                            defaultState.entities[pk]
                                        );
                                    }
                                }
                                if (entitiesToUpsert.length > 0) {
                                    collection.upsertMany(entitiesToUpsert);
                                }

                                // Remove deleted entities
                                const removedArray = Array.from(diff.removed);
                                const removedLength = removedArray.length;
                                if (removedLength > 0) {
                                    const entitiesToRemove: TEntity[] = [];
                                    for (let i = 0; i < removedLength; i++) {
                                        const pk = removedArray[i];
                                        const entity = oldEntities[pk];
                                        if (entity) {
                                            entitiesToRemove.push(entity);
                                        }
                                    }
                                    if (entitiesToRemove.length > 0) {
                                        collection.removeMany(entitiesToRemove);
                                    }
                                }
                            } finally {
                                isSyncingFromChild = false;
                            }
                        }
                    }

                    return childState;
                }

                return childState;
            }

            // No child reducer and not OIMDB_UPDATE - return state unchanged
            return state;
        };

        return reducer;
    }

    /**
     * Create Redux reducer for an index
     */
    public createIndexReducer<
        TIndexKey extends TOIMPk,
        TPk extends TOIMPk,
        TState,
    >(
        index: OIMReactiveIndex<TIndexKey, TPk, OIMIndex<TIndexKey, TPk>>,
        mapper?: TOIMIndexMapper<TIndexKey, TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            this.options.defaultIndexMapper ??
            (defaultIndexMapper as TOIMIndexMapper<TIndexKey, TPk, TState>);

        // Track updated keys
        const reducerData = {
            updatedKeys: null as Set<TIndexKey> | null,
            mapper: actualMapper,
        };
        this.indexReducers.set(
            index as unknown as OIMReactiveIndex<
                TOIMPk,
                TOIMPk,
                OIMIndex<TOIMPk, TOIMPk>
            >,
            reducerData as {
                updatedKeys: Set<TOIMPk> | null;
                mapper?: TOIMIndexMapper<TOIMPk, TOIMPk, unknown>;
            }
        );

        // Subscribe to BEFORE_FLUSH from coalescer
        const beforeFlushHandler = () => {
            const updatedKeys = index.coalescer.getUpdatedKeys();
            reducerData.updatedKeys = updatedKeys;
        };
        index.coalescer.emitter.on(
            EOIMUpdateEventCoalescerEventType.BEFORE_FLUSH,
            beforeFlushHandler
        );

        // Create reducer function
        const reducer: Reducer<TState | undefined, Action> = (
            state: TState | undefined,
            action: Action
        ) => {
            // Initialize state if undefined (required by Redux combineReducers)
            if (state === undefined) {
                // Get all keys for initialization
                const allKeys = new Set(index.getKeys());
                return actualMapper(index, allKeys, undefined);
            }

            // Only handle our action type
            if (action.type !== EOIMDBReducerActionType.UPDATE) {
                return state;
            }

            // If no updates, return state unchanged
            if (reducerData.updatedKeys === null) {
                return state;
            }

            // Create new state using mapper
            const updatedKeys = reducerData.updatedKeys;
            const newState = actualMapper(
                index,
                updatedKeys,
                state as TState | undefined
            );

            // Clear updated keys
            reducerData.updatedKeys = null;

            return newState;
        };

        return reducer;
    }
}
