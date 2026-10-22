import type {
    IOIMChannelMap,
    IOIMContentChangeListener,
    TOIMBucketSlot,
    TOIMDefaultSlotStore,
    TOIMEffect,
    TOIMEntitySlot,
    TOIMDisposer,
    TOIMStoreKey,
    TOIMStoreSlot,
} from '@oimdb/core';
import { OIMChannelService, OIMContentChangeListenerService, OIMEffectService } from '@oimdb/core';
import type { TOIMReduxEntityCollectionService } from '../types/TOIMReduxEntityCollectionService';
import type { Store, Reducer, Action, Middleware } from 'redux';
import { EOIMReduxReducerActionType } from '../enums/EOIMReduxReducerActionType';
import type { TOIMReduxAdapterOptions } from '../types/TOIMReduxAdapterOptions';
import type { TOIMReduxCollectionMapper } from '../types/TOIMReduxCollectionMapper';
import type { TOIMReduxIndexMapper } from '../types/TOIMReduxIndexMapper';
import type { TOIMReduxCollectionReducerChildOptions } from '../types/TOIMReduxCollectionReducerChildOptions';
import type { TOIMReduxIndexReducerChildOptions } from '../types/TOIMReduxIndexReducerChildOptions';
import type { TOIMReduxGlobalIndex } from '../types/TOIMReduxGlobalIndex';
import type { TOIMReduxGlobalIndexMapper } from '../types/TOIMReduxGlobalIndexMapper';
import type { TOIMReduxGlobalIndexReducerChildOptions } from '../types/TOIMReduxGlobalIndexReducerChildOptions';
import type { TOIMReduxKeyedIndex } from '../types/TOIMReduxKeyedIndex';
import { oimDefaultCollectionMapper } from './oimDefaultCollectionMapper';
import { oimDefaultKeyedIndexMapper } from './oimDefaultKeyedIndexMapper';
import { oimDefaultGlobalIndexMapper } from './oimDefaultGlobalIndexMapper';
import { OIMReduxReducerFactory } from './OIMReduxReducerFactory';

type TOIMReduxKeyedReducerEntry = {
    updatedKeys: Set<TOIMStoreKey>;
    forceRecompute: boolean;
};

type TOIMReduxGlobalIndexEntry = {
    dirty: boolean;
};

export class OIMReduxAdapter {
    private store?: Store;
    private readonly channelMap: IOIMChannelMap;
    private readonly reducerFactory: OIMReduxReducerFactory;

    // A subscription left here after dispose() pins the identity it watches for
    // the life of the process. Entity slots dispose their own watch and are not in here.
    private readonly disposers: TOIMDisposer[] = [];

    private readonly instrumentedCollections = new WeakSet<object>();
    private readonly instrumentedIndexes = new WeakSet<object>();

    // A LIST per key, never one entry: two reducers over one population are two
    // states, and the one with no room stops being told what moved.
    private readonly collectionReducers = new Map<object, TOIMReduxKeyedReducerEntry[]>();
    private readonly indexReducers = new Map<object, TOIMReduxKeyedReducerEntry[]>();
    private readonly globalIndexReducers = new Map<TOIMBucketSlot, TOIMReduxGlobalIndexEntry[]>();

    private readonly afterEachFrameHandler = (): void => {
        if (this.store === undefined) return;
        if (!this.hasPendingChanges()) return;
        this.store.dispatch({ type: EOIMReduxReducerActionType.UPDATE });
    };

    constructor(reduxAdapterOptions: TOIMReduxAdapterOptions) {
        this.channelMap = reduxAdapterOptions.channelMap;
        this.reducerFactory = new OIMReduxReducerFactory();
        this.disposers.push(
            OIMChannelService.INSTANCE.subscribeAfterEachFrame(this.channelMap.defaultChannelSlot, this.afterEachFrameHandler),
        );
    }

    private register<TWatched, TEntry>(
        registry: Map<TWatched, TEntry[]>,
        watched: TWatched,
        entry: TEntry
    ): void {
        const entries = registry.get(watched);
        if (entries === undefined) registry.set(watched, [entry]);
        else entries.push(entry);
    }

    /** The sole writer of `updatedKeys`: a key is spent on an entry that is already recomputing everything. */
    private noteKeyChanged(
        entries: readonly TOIMReduxKeyedReducerEntry[] | undefined,
        key: TOIMStoreKey
    ): void {
        if (entries === undefined) return;
        for (let i = 0; i < entries.length; i++) {
            const reducerEntry = entries[i];
            if (reducerEntry.forceRecompute) continue;
            reducerEntry.updatedKeys.add(key);
        }
    }

    private hasPendingChanges(): boolean {
        for (const entries of this.collectionReducers.values()) {
            for (const reducerEntry of entries) {
                if (reducerEntry.forceRecompute || reducerEntry.updatedKeys.size > 0) return true;
            }
        }
        for (const entries of this.indexReducers.values()) {
            for (const reducerEntry of entries) {
                if (reducerEntry.forceRecompute || reducerEntry.updatedKeys.size > 0) return true;
            }
        }
        for (const entries of this.globalIndexReducers.values()) {
            for (const reducerEntry of entries) {
                if (reducerEntry.dirty) return true;
            }
        }
        return false;
    }

    public setStore(store: Store): void {
        this.store = store;
        // What moved before a store existed would otherwise wait for the next
        // frame that changes something else — possibly forever.
        if (this.hasPendingChanges()) {
            store.dispatch({ type: EOIMReduxReducerActionType.UPDATE });
        }
    }

    /** Idempotent and terminal; every subscription must go or it pins an identity. */
    public dispose(): void {
        for (let i = 0; i < this.disposers.length; i++) this.disposers[i]();
        this.disposers.length = 0;
        this.collectionReducers.clear();
        this.indexReducers.clear();
        this.globalIndexReducers.clear();
    }

    public createMiddleware(): Middleware {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return _store => next => action => {
            const result = next(action);
            OIMChannelService.INSTANCE.flush(this.channelMap.defaultChannelSlot);
            return result;
        };
    }

    public createCollectionReducer<
        TEntity extends object,
        TPk extends TOIMStoreKey,
        TState,
        TStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
        TLinkedBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
        TLinkedEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<object, TOIMStoreKey>>,
    >(
        entityService: TOIMReduxEntityCollectionService<TEntity, TStore>,
        entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>,
        reduxCollectionReducerChildOptions?: TOIMReduxCollectionReducerChildOptions<
            TEntity, TPk, TState, TStore, TLinkedBucketStore, TLinkedEntityStore
        >,
        mapper?: TOIMReduxCollectionMapper<TEntity, TPk, TState, TStore>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            (oimDefaultCollectionMapper as unknown as TOIMReduxCollectionMapper<TEntity, TPk, TState, TStore>);

        const reducerEntry = {
            updatedKeys: new Set<TPk>(),
            forceRecompute: false,
            mapper: actualMapper,
        };
        this.register<object, TOIMReduxKeyedReducerEntry>(this.collectionReducers, entityStoreSlot, reducerEntry);

        this.instrumentCollection(entityService, entityStoreSlot);

        return this.reducerFactory.createCollectionReducer(
            entityService,
            entityStoreSlot,
            reducerEntry,
            reduxCollectionReducerChildOptions
        );
    }

    public createKeyedIndexReducer<
        TIndexKey extends TOIMStoreKey,
        TPk extends TOIMStoreKey,
        TState,
        TEntity extends object,
        TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
        TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    >(
        keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>,
        reduxIndexReducerChildOptions?: TOIMReduxIndexReducerChildOptions<
            TIndexKey, TPk, TState, TEntity, TBucketStore, TEntityStore
        >,
        mapper?: TOIMReduxIndexMapper<TIndexKey, TPk, TState, TEntity, TBucketStore, TEntityStore>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            (oimDefaultKeyedIndexMapper as unknown as TOIMReduxIndexMapper<
                TIndexKey, TPk, TState, TEntity, TBucketStore, TEntityStore
            >);

        const reducerEntry = {
            updatedKeys: new Set<TIndexKey>(),
            forceRecompute: false,
            mapper: actualMapper,
        };
        this.register<object, TOIMReduxKeyedReducerEntry>(
            this.indexReducers, keyedIndex.bucketStoreSlot, reducerEntry);

        this.instrumentKeyedIndex(keyedIndex);

        return this.reducerFactory.createKeyedIndexReducer(
            keyedIndex,
            reducerEntry,
            reduxIndexReducerChildOptions
        );
    }

    public createGlobalIndexReducer<
        TPk extends TOIMStoreKey,
        TState,
        TEntity extends object,
        TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
        TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    >(
        globalIndex: TOIMReduxGlobalIndex<TPk, TEntity, TEntityStore, TBucketStore>,
        reduxGlobalIndexReducerChildOptions?: TOIMReduxGlobalIndexReducerChildOptions<
            TPk, TState, TEntity, TEntityStore, TBucketStore
        >,
        mapper?: TOIMReduxGlobalIndexMapper<TPk, TState, TEntity, TEntityStore, TBucketStore>
    ): Reducer<TState | undefined, Action> {
        const actualMapper =
            mapper ??
            (oimDefaultGlobalIndexMapper as unknown as TOIMReduxGlobalIndexMapper<
                TPk, TState, TEntity, TEntityStore, TBucketStore
            >);

        const reducerEntry = { dirty: false, mapper: actualMapper };
        this.register<TOIMBucketSlot, TOIMReduxGlobalIndexEntry>(
            this.globalIndexReducers, globalIndex.bucketSlot, reducerEntry);

        this.instrumentGlobalIndex(globalIndex);

        return this.reducerFactory.createGlobalIndexReducer(
            globalIndex,
            reducerEntry,
            reduxGlobalIndexReducerChildOptions
        );
    }

    /**
     * The registry is READ in the handler, never captured in it: a bucket is
     * instrumented once, so a closure over one reducer's bookkeeping would set
     * only that reducer's `dirty` while the others stayed clean.
     */
    private instrumentGlobalIndex<TPk extends TOIMStoreKey, TEntity extends object, TEntityStore, TBucketStore>(
        globalIndex: TOIMReduxGlobalIndex<TPk, TEntity, TEntityStore, TBucketStore>
    ): void {
        if (this.instrumentedIndexes.has(globalIndex.bucketSlot)) return;
        this.instrumentedIndexes.add(globalIndex.bucketSlot);

        const bucketSlot = globalIndex.bucketSlot;
        this.disposers.push(OIMEffectService.INSTANCE.subscribeEffect(this.channelMap, [bucketSlot], [], () => {
            const entries = this.globalIndexReducers.get(bucketSlot);
            if (entries === undefined) return;
            for (let i = 0; i < entries.length; i++) entries[i].dirty = true;
        }));
    }

    /** Walk once, then watch the collection and each row: */
    private instrumentCollection<TEntity extends object, TStore>(
        entityService: TOIMReduxEntityCollectionService<TEntity, TStore>,
        entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>
    ): void {
        if (this.instrumentedCollections.has(entityStoreSlot)) return;
        this.instrumentedCollections.add(entityStoreSlot);

        // NOT a cell on the slot: `slot.data` belongs to the application, and
        // an adapter writing there would overwrite whatever the application
        // keeps in it — so the adapter's own watch lives in this map.
        const watched = new Map<TOIMEntitySlot, TOIMEffect>();

        const nameOf = (entitySlot: TOIMEntitySlot): TOIMStoreKey => entitySlot.key as TOIMStoreKey;

        // EVERY MOVE IS RECORDED, whoever caused it; nothing here may be
        // suppressed during a flush.
        const noteChanged = (key: TOIMStoreKey): void =>
            this.noteKeyChanged(this.collectionReducers.get(entityStoreSlot), key);

        const watch = (entitySlot: TOIMEntitySlot): boolean => {
            if (watched.has(entitySlot)) return false;
            const effect: TOIMEffect = OIMEffectService.INSTANCE.createEffect(this.channelMap, [entitySlot], [], () => {
                noteChanged(nameOf(entitySlot));
                // Report the removal BEFORE letting go: detaching first lets the
                // engine reclaim the identity with the reducer never told.
                if (entitySlot.entity === undefined) {
                    watched.delete(entitySlot);
                    OIMEffectService.INSTANCE.disposeEffect(effect);
                }
            });
            watched.set(entitySlot, effect);
            return true;
        };

        const watchIfItHasAValue = (entitySlot: TOIMEntitySlot): void => {
            if (entitySlot.entity === undefined) return;
            if (watch(entitySlot)) noteChanged(nameOf(entitySlot));
        };

        for (const entitySlot of entityService.getSlots(entityStoreSlot)) watchIfItHasAValue(entitySlot);

        const contentChangeListener: IOIMContentChangeListener<TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>> = {
            onContentChanged: entitySlot => { watchIfItHasAValue(entitySlot); },
            onContentChangedMany: slotChannelQueue => {
                for (let i = 0; i < slotChannelQueue.getEntryCount(); i++) watchIfItHasAValue(slotChannelQueue.getEntryAt(i));
            },
        };
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(entityStoreSlot, contentChangeListener, undefined);

        this.disposers.push(() => {
            OIMContentChangeListenerService.INSTANCE.removeContentChangeListener(entityStoreSlot, contentChangeListener);
            for (const effect of watched.values()) OIMEffectService.INSTANCE.disposeEffect(effect);
            watched.clear();
        });
    }

    private instrumentKeyedIndex<
        TIndexKey extends TOIMStoreKey,
        TPk extends TOIMStoreKey,
        TEntity extends object,
        TBucketStore,
        TEntityStore,
    >(
        keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>
    ): void {
        const { bucketService, bucketStoreSlot } = keyedIndex;
        const bucketContentService = bucketService.slotContentService;
        if (this.instrumentedIndexes.has(bucketStoreSlot)) return;
        this.instrumentedIndexes.add(bucketStoreSlot);

        // `TOIMBucketSlot` carries no `data`, so a bucket's per-consumer state
        // has nowhere to live but a map the consumer owns.
        const watched = new Map<TOIMBucketSlot, TOIMEffect>();

        const noteChanged = (key: TOIMStoreKey): void =>
            this.noteKeyChanged(this.indexReducers.get(bucketStoreSlot), key);

        const watchBucket = (bucketSlot: TOIMBucketSlot<unknown, TOIMStoreKey>): boolean => {
            if (watched.has(bucketSlot)) return false;
            const effect: TOIMEffect = OIMEffectService.INSTANCE.createEffect(this.channelMap, [bucketSlot], [], () => {
                noteChanged(bucketSlot.key);
                // Report the emptying BEFORE letting go, as the row watch does.
                if (bucketContentService.getBucketMemberSlotCount(bucketSlot) === 0) {
                    watched.delete(bucketSlot);
                    OIMEffectService.INSTANCE.disposeEffect(effect);
                }
            });
            watched.set(bucketSlot, effect);
            return true;
        };

        const watchIfItHasSlots = (bucketSlot: TOIMBucketSlot<unknown, TOIMStoreKey>): void => {
            if (bucketContentService.getBucketMemberSlotCount(bucketSlot) === 0) return;
            if (watchBucket(bucketSlot)) noteChanged(bucketSlot.key);
        };

        for (const bucketSlot of bucketService.getSlots(bucketStoreSlot)) watchIfItHasSlots(bucketSlot);

        const contentChangeListener: IOIMContentChangeListener<TOIMBucketSlot<unknown, TOIMStoreKey>, readonly TOIMEntitySlot[]> = {
            onContentChanged: bucketSlot => { watchIfItHasSlots(bucketSlot); },
            onContentChangedMany: bucketSlotChannelQueue => {
                for (let i = 0; i < bucketSlotChannelQueue.getEntryCount(); i++) watchIfItHasSlots(bucketSlotChannelQueue.getEntryAt(i));
            },
        };
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(bucketStoreSlot, contentChangeListener, undefined);
        this.disposers.push(() => {
            OIMContentChangeListenerService.INSTANCE.removeContentChangeListener(bucketStoreSlot, contentChangeListener);
            for (const effect of watched.values()) OIMEffectService.INSTANCE.disposeEffect(effect);
            watched.clear();
        });
    }
}
