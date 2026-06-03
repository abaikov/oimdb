import {
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    OIMEventQueue,
    EOIMEventQueueEventType,
    EOIMCollectionEventType,
    EOIMIndexEventType,
    TOIMCollectionUpdatePayload,
    TOIMIndexUpdatePayload,
    TOIMPk,
} from '@oimdb/core';
import { Store, Reducer, Action, Middleware } from 'redux';
import { EOIMDBReduxReducerActionType } from '../enums/EOIMDBReduxReducerActionType';
import { TOIMDBReduxAdapterOptions } from '../types/TOIMDBReduxAdapterOptions';
import { TOIMDBReduxCollectionMapper } from '../types/TOIMDBReduxCollectionMapper';
import { TOIMDBReduxIndexMapper } from '../types/TOIMDBReduxIndexMapper';
import { TOIMDBReduxCollectionReducerChildOptions } from '../types/TOIMDBReduxCollectionReducerChildOptions';
import { TOIMDBReduxIndexReducerChildOptions } from '../types/TOIMDBReduxIndexReducerChildOptions';
import {
    defaultCollectionMapper,
    defaultIndexMapper,
} from './OIMDBReduxDefaultMappers';
import { OIMDBReduxReducerFactory } from './OIMDBReduxReducerFactory';

/**
 * OIMDB Redux Update Action
 */
export type OIMDBReduxUpdateAction = {
    type: EOIMDBReduxReducerActionType.UPDATE;
};

/**
 * Adapter for integrating OIMDB with Redux.
 * Creates Redux reducers from OIMDB collections and indexes, and provides middleware
 * for automatic event queue flushing.
 */
export class OIMDBReduxAdapter {
    private store?: Store;
    private readonly queue: OIMEventQueue;
    private readonly options: TOIMDBReduxAdapterOptions;
    private queueFlushHandler?: () => void;
    private queueBeforeFlushHandler?: () => void;
    private isFlushingSilently = false;
    private readonly instrumentedCollections = new WeakSet<object>();
    private readonly instrumentedIndexes = new WeakSet<object>();

    // Track reducers and their updated keys
    // Using object and TOIMPk as base types to allow storing different concrete types
    private collectionReducers = new Map<
        OIMReactiveCollection<object, TOIMPk>,
        {
            updatedKeys: Set<TOIMPk> | null;
            forceRecompute: boolean;
            pendingKeys: Set<TOIMPk>;
            pendingForceRecompute: boolean;
            mapper?: TOIMDBReduxCollectionMapper<object, TOIMPk, unknown>;
        }
    >();

    private indexReducers = new Map<
        | OIMReactiveIndexSetBased<
              TOIMPk,
              TOIMPk,
              OIMIndexSetBased<TOIMPk, TOIMPk>
          >
        | OIMReactiveIndexArrayBased<
              TOIMPk,
              TOIMPk,
              OIMIndexArrayBased<TOIMPk, TOIMPk>
          >,
        {
            updatedKeys: Set<TOIMPk> | null;
            pendingKeys: Set<TOIMPk>;
            forceRecompute: boolean;
            pendingForceRecompute: boolean;
            mapper?: TOIMDBReduxIndexMapper<TOIMPk, TOIMPk, unknown>;
        }
    >();

    private readonly reducerFactory: OIMDBReduxReducerFactory;

    constructor(queue: OIMEventQueue, options?: TOIMDBReduxAdapterOptions) {
        this.queue = queue;
        this.options = options ?? {};
        this.reducerFactory = new OIMDBReduxReducerFactory();

        this.queueBeforeFlushHandler = () => {
            // If we're flushing silently, drop any accumulated pending updates so they don't
            // leak into the next visible flush (Redux has already handled state changes).
            if (this.isFlushingSilently) {
                this.collectionReducers.forEach(data => {
                    data.pendingKeys.clear();
                    data.pendingForceRecompute = false;
                    data.updatedKeys = null;
                    data.forceRecompute = false;
                });
                this.indexReducers.forEach(data => {
                    data.pendingKeys.clear();
                    data.updatedKeys = null;
                });
                return;
            }

            // Snapshot pending keys at the flush boundary.
            this.collectionReducers.forEach(data => {
                if (data.pendingForceRecompute) {
                    data.updatedKeys = new Set();
                    data.forceRecompute = true;
                    data.pendingForceRecompute = false;
                    data.pendingKeys.clear();
                    return;
                }
                if (data.pendingKeys.size === 0) return;
                data.updatedKeys = new Set(data.pendingKeys);
                data.pendingKeys.clear();
                data.forceRecompute = false;
            });

            this.indexReducers.forEach(data => {
                if (data.pendingForceRecompute) {
                    data.updatedKeys = new Set();
                    data.forceRecompute = true;
                    data.pendingForceRecompute = false;
                    data.pendingKeys.clear();
                    return;
                }
                if (data.pendingKeys.size === 0) return;
                data.updatedKeys = new Set(data.pendingKeys);
                data.pendingKeys.clear();
                data.forceRecompute = false;
            });
        };

        // Subscribe to queue flush to dispatch action
        this.queueFlushHandler = () => {
            // Don't dispatch if we're in silent flush mode
            if (this.isFlushingSilently) {
                return;
            }
            if (this.store) {
                this.store.dispatch({
                    type: EOIMDBReduxReducerActionType.UPDATE,
                });
            }
        };
        this.queue.emitter.on(
            EOIMEventQueueEventType.BEFORE_FLUSH,
            this.queueBeforeFlushHandler
        );
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
        // Prevent reentrant calls
        if (this.isFlushingSilently) {
            return;
        }

        this.isFlushingSilently = true;
        if (this.queueFlushHandler) {
            // Temporarily remove handler to prevent dispatch
            this.queue.emitter.off(
                EOIMEventQueueEventType.AFTER_FLUSH,
                this.queueFlushHandler
            );
        }

        // Flush the queue - this may trigger new events, but they won't cause dispatch
        this.queue.flush();

        // Restore handler
        if (this.queueFlushHandler) {
            this.queue.emitter.on(
                EOIMEventQueueEventType.AFTER_FLUSH,
                this.queueFlushHandler
            );
        }
        this.isFlushingSilently = false;
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
     * import { OIMDBReduxAdapter } from '@oimdb/redux-adapter';
     *
     * const adapter = new OIMDBReduxAdapter(queue);
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return _store => next => action => {
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
     * @param child - Optional child reducer that handles custom actions and syncs changes back to OIMDB
     * @param mapper - Optional mapper for converting OIMDB state to Redux state
     */
    public createCollectionReducer<
        TEntity extends object,
        TPk extends TOIMPk,
        TState,
    >(
        collection: OIMReactiveCollection<TEntity, TPk>,
        child?: TOIMDBReduxCollectionReducerChildOptions<TEntity, TPk, TState>,
        mapper?: TOIMDBReduxCollectionMapper<TEntity, TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            this.options.defaultCollectionMapper ??
            (defaultCollectionMapper as TOIMDBReduxCollectionMapper<
                TEntity,
                TPk,
                TState
            >);

        // Track updated keys
        const reducerData = {
            updatedKeys: null as Set<TPk> | null,
            forceRecompute: false,
            pendingKeys: new Set<TPk>(),
            pendingForceRecompute: false,
            mapper: actualMapper,
        };
        this.collectionReducers.set(
            collection as unknown as OIMReactiveCollection<object, TOIMPk>,
            reducerData as {
                updatedKeys: Set<TOIMPk> | null;
                forceRecompute: boolean;
                pendingKeys: Set<TOIMPk>;
                pendingForceRecompute: boolean;
                mapper?: TOIMDBReduxCollectionMapper<object, TOIMPk, unknown>;
            }
        );

        this.instrumentCollection(collection);

        // Create reducer using factory
        return this.reducerFactory.createCollectionReducer(
            collection,
            reducerData,
            child
        );
    }

    /**
     * Create Redux reducer for an index
     * @param index - The reactive index
     * @param child - Optional child reducer that handles custom actions and syncs changes back to OIMDB
     * @param mapper - Optional mapper for converting OIMDB state to Redux state
     */
    public createIndexReducer<
        TIndexKey extends TOIMPk,
        TPk extends TOIMPk,
        TState,
    >(
        index:
            | OIMReactiveIndexSetBased<
                  TIndexKey,
                  TPk,
                  OIMIndexSetBased<TIndexKey, TPk>
              >
            | OIMReactiveIndexArrayBased<
                  TIndexKey,
                  TPk,
                  OIMIndexArrayBased<TIndexKey, TPk>
              >,
        child?: TOIMDBReduxIndexReducerChildOptions<TIndexKey, TPk, TState>,
        mapper?: TOIMDBReduxIndexMapper<TIndexKey, TPk, TState>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            this.options.defaultIndexMapper ??
            (defaultIndexMapper as TOIMDBReduxIndexMapper<
                TIndexKey,
                TPk,
                TState
            >);

        // Track updated keys
        const reducerData = {
            updatedKeys: null as Set<TIndexKey> | null,
            pendingKeys: new Set<TIndexKey>(),
            forceRecompute: false,
            pendingForceRecompute: false,
            mapper: actualMapper,
        };
        this.indexReducers.set(
            index as unknown as
                | OIMReactiveIndexSetBased<
                      TOIMPk,
                      TOIMPk,
                      OIMIndexSetBased<TOIMPk, TOIMPk>
                  >
                | OIMReactiveIndexArrayBased<
                      TOIMPk,
                      TOIMPk,
                      OIMIndexArrayBased<TOIMPk, TOIMPk>
                  >,
            reducerData as {
                updatedKeys: Set<TOIMPk> | null;
                pendingKeys: Set<TOIMPk>;
                forceRecompute: boolean;
                pendingForceRecompute: boolean;
                mapper?: TOIMDBReduxIndexMapper<TOIMPk, TOIMPk, unknown>;
            }
        );

        this.instrumentIndex(index);

        // Create reducer using factory
        return this.reducerFactory.createIndexReducer(
            index,
            reducerData,
            child
        );
    }

    private instrumentCollection<TEntity extends object, TPk extends TOIMPk>(
        collection: OIMReactiveCollection<TEntity, TPk>
    ): void {
        if (this.instrumentedCollections.has(collection as object)) return;
        this.instrumentedCollections.add(collection as object);

        const colAny = collection as unknown as Record<string, unknown>;
        const getData = () =>
            this.collectionReducers.get(
                collection as unknown as OIMReactiveCollection<object, TOIMPk>
            );

        const wrapPks = (pks: readonly TPk[]) => {
            const data = getData();
            if (!data) return;
            if (data.pendingForceRecompute) return;
            for (let i = 0; i < pks.length; i++) data.pendingKeys.add(pks[i]);
        };

        const markClear = () => {
            const data = getData();
            if (!data) return;
            data.pendingForceRecompute = true;
            data.pendingKeys.clear();
        };

        const wrapMethod = (
            name: string,
            after: (...args: unknown[]) => void
        ) => {
            const original = colAny[name];
            if (typeof original !== 'function') return;
            colAny[name] = (...args: unknown[]) => {
                // Preserve method receiver (`this`) for class methods.
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                const res = (original as (...a: unknown[]) => unknown).apply(
                    collection as unknown as object,
                    args
                );
                after(...args);
                return res;
            };
        };

        wrapMethod('upsertOneByPk', (pk: unknown) => {
            if (pk !== undefined) wrapPks([pk as TPk]);
        });
        wrapMethod('upsertOne', (entity: unknown) => {
            try {
                const selectPk = (
                    collection as unknown as {
                        selectPk: (value: unknown) => TPk;
                    }
                ).selectPk;
                const pk = selectPk(entity);
                if (pk !== undefined) wrapPks([pk]);
            } catch {
                // ignore - original call may throw and tests will catch it
            }
        });
        wrapMethod('upsertMany', (entities: unknown) => {
            if (!Array.isArray(entities)) return;
            const pks: TPk[] = [];
            for (let i = 0; i < entities.length; i++) {
                try {
                    const selectPk = (
                        collection as unknown as {
                            selectPk: (value: unknown) => TPk;
                        }
                    ).selectPk;
                    const pk = selectPk(entities[i]);
                    if (pk !== undefined) pks.push(pk);
                } catch {
                    // ignore
                }
            }
            if (pks.length > 0) wrapPks(pks);
        });
        wrapMethod('removeOneByPk', (pk: unknown) => {
            if (pk !== undefined) wrapPks([pk as TPk]);
        });
        wrapMethod('removeOne', (entity: unknown) => {
            try {
                const selectPk = (
                    collection as unknown as {
                        selectPk: (value: unknown) => TPk;
                    }
                ).selectPk;
                const pk = selectPk(entity);
                if (pk !== undefined) wrapPks([pk]);
            } catch {
                // ignore
            }
        });
        wrapMethod('removeMany', (entities: unknown) => {
            if (!Array.isArray(entities)) return;
            const pks: TPk[] = [];
            for (let i = 0; i < entities.length; i++) {
                try {
                    const selectPk = (
                        collection as unknown as {
                            selectPk: (value: unknown) => TPk;
                        }
                    ).selectPk;
                    const pk = selectPk(entities[i]);
                    if (pk !== undefined) pks.push(pk);
                } catch {
                    // ignore
                }
            }
            if (pks.length > 0) wrapPks(pks);
        });
        wrapMethod('removeManyByPks', (pks: unknown) => {
            if (!Array.isArray(pks)) return;
            wrapPks(pks as TPk[]);
        });
        wrapMethod('clear', () => {
            markClear();
        });
    }

    private instrumentIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index:
            | OIMReactiveIndexSetBased<TKey, TPk, OIMIndexSetBased<TKey, TPk>>
            | OIMReactiveIndexArrayBased<TKey, TPk, OIMIndexArrayBased<TKey, TPk>>
    ): void {
        if (this.instrumentedIndexes.has(index as object)) return;
        this.instrumentedIndexes.add(index as object);

        const idxAny = index as unknown as Record<string, unknown>;
        const getData = () =>
            this.indexReducers.get(
                index as unknown as
                    | OIMReactiveIndexSetBased<
                          TOIMPk,
                          TOIMPk,
                          OIMIndexSetBased<TOIMPk, TOIMPk>
                      >
                    | OIMReactiveIndexArrayBased<
                          TOIMPk,
                          TOIMPk,
                          OIMIndexArrayBased<TOIMPk, TOIMPk>
                      >
            );

        const markKeys = (keys: readonly TKey[]) => {
            const data = getData();
            if (!data) return;
            if (data.pendingForceRecompute) return;
            for (let i = 0; i < keys.length; i++) data.pendingKeys.add(keys[i]);
        };

        const markClearAll = () => {
            const data = getData();
            if (!data) return;
            data.pendingForceRecompute = true;
            data.pendingKeys.clear();
        };

        const wrapMethod = (
            name: string,
            after: (...args: unknown[]) => void
        ) => {
            const original = idxAny[name];
            if (typeof original !== 'function') return;
            idxAny[name] = (...args: unknown[]) => {
                // Preserve method receiver (`this`) for class methods.
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                const res = (original as (...a: unknown[]) => unknown).apply(
                    index as unknown as object,
                    args
                );
                after(...args);
                return res;
            };
        };

        wrapMethod('setPks', (key: unknown) => markKeys([key as TKey]));
        wrapMethod('addPks', (key: unknown) => markKeys([key as TKey]));
        wrapMethod('removePks', (key: unknown) => markKeys([key as TKey]));
        wrapMethod('clear', (key: unknown) => {
            if (key === undefined) {
                markClearAll();
            } else {
                markKeys([key as TKey]);
            }
        });
    }
}
