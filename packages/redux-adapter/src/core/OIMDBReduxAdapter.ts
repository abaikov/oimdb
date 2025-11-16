import {
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    OIMEventQueue,
    EOIMUpdateEventCoalescerEventType,
    EOIMEventQueueEventType,
    TOIMPk,
} from '@oimdb/core';
import { Store, Reducer, Action, Middleware } from 'redux';
import { EOIMDBReduxReducerActionType } from '../enum/EOIMDBReduxReducerActionType';
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
    private isFlushingSilently = false;

    // Track reducers and their updated keys
    // Using object and TOIMPk as base types to allow storing different concrete types
    private collectionReducers = new Map<
        OIMReactiveCollection<object, TOIMPk>,
        {
            updatedKeys: Set<TOIMPk> | null;
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
            mapper?: TOIMDBReduxIndexMapper<TOIMPk, TOIMPk, unknown>;
        }
    >();

    private readonly reducerFactory: OIMDBReduxReducerFactory;

    constructor(queue: OIMEventQueue, options?: TOIMDBReduxAdapterOptions) {
        this.queue = queue;
        this.options = options ?? {};
        this.reducerFactory = new OIMDBReduxReducerFactory();

        // Subscribe to queue flush to dispatch action
        // Use AFTER_FLUSH so that coalescers have already collected updatedKeys
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
            mapper: actualMapper,
        };
        this.collectionReducers.set(
            collection as unknown as OIMReactiveCollection<object, TOIMPk>,
            reducerData as {
                updatedKeys: Set<TOIMPk> | null;
                mapper?: TOIMDBReduxCollectionMapper<object, TOIMPk, unknown>;
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
                mapper?: TOIMDBReduxIndexMapper<TOIMPk, TOIMPk, unknown>;
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

        // Create reducer using factory
        return this.reducerFactory.createIndexReducer(
            index,
            reducerData,
            child
        );
    }
}
