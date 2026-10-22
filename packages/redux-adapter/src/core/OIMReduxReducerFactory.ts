import type { Reducer, Action } from 'redux';
import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxEntityCollectionService } from '../types/TOIMReduxEntityCollectionService';
import { EOIMReduxReducerActionType } from '../enums/EOIMReduxReducerActionType';
import type { TOIMReduxCollectionMapper } from '../types/TOIMReduxCollectionMapper';
import type { TOIMReduxIndexMapper } from '../types/TOIMReduxIndexMapper';
import type { TOIMReduxCollectionReducerChildOptions } from '../types/TOIMReduxCollectionReducerChildOptions';
import type { TOIMReduxIndexReducerChildOptions } from '../types/TOIMReduxIndexReducerChildOptions';
import type { TOIMReduxGlobalIndex } from '../types/TOIMReduxGlobalIndex';
import type { TOIMReduxGlobalIndexMapper } from '../types/TOIMReduxGlobalIndexMapper';
import type { TOIMReduxGlobalIndexReducerChildOptions } from '../types/TOIMReduxGlobalIndexReducerChildOptions';
import type { TOIMReduxDefaultGlobalIndexState } from '../types/TOIMReduxDefaultGlobalIndexState';
import type { TOIMReduxKeyedIndex } from '../types/TOIMReduxKeyedIndex';
import { OIMReduxChildAwareReducer } from './OIMReduxChildAwareReducer';
import { collectEntitiesByName } from '../utils/collectEntitiesByName';
import { oimDiffEntityKeys } from '../utils/oimDiffEntityKeys';
import { oimHasReduxStateField } from '../utils/oimHasReduxStateField';
import type { TOIMReduxDefaultCollectionState } from '../types/TOIMReduxDefaultCollectionState';
import type { TOIMReduxDefaultIndexState } from '../types/TOIMReduxDefaultIndexState';
import { OIMReduxLinkedIndexesUpdater } from './OIMReduxLinkedIndexesUpdater';

type TOIMReduxCollectionReducerEntry<TEntity extends object, TPk extends TOIMStoreKey, TState, TStore> = {
    updatedKeys: Set<TPk>;
    forceRecompute: boolean;
    mapper: TOIMReduxCollectionMapper<TEntity, TPk, TState, TStore>;
};

type TOIMReduxIndexReducerEntry<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
    TState,
    TEntity extends object,
    TBucketStore,
    TEntityStore,
> = {
    updatedKeys: Set<TIndexKey>;
    forceRecompute: boolean;
    mapper: TOIMReduxIndexMapper<TIndexKey, TPk, TState, TEntity, TBucketStore, TEntityStore>;
};

type TOIMReduxGlobalIndexReducerEntry<
    TPk extends TOIMStoreKey, TState, TEntity extends object, TEntityStore, TBucketStore,
> = {
    dirty: boolean;
    mapper: TOIMReduxGlobalIndexMapper<TPk, TState, TEntity, TEntityStore, TBucketStore>;
};

export class OIMReduxReducerFactory {
    private isReduxInitAction(action: Action): boolean {
        const type = (action as unknown as { type?: unknown }).type;
        return typeof type === 'string' && type.startsWith('@@redux/');
    }

    public createCollectionReducer<
        TEntity extends object, TPk extends TOIMStoreKey, TState, TStore, TLinkedBucketStore, TLinkedEntityStore,
    >(
        entityService: TOIMReduxEntityCollectionService<TEntity, TStore>,
        entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>,
        reducerEntry: TOIMReduxCollectionReducerEntry<TEntity, TPk, TState, TStore>,
        reduxCollectionReducerChildOptions?: TOIMReduxCollectionReducerChildOptions<
            TEntity, TPk, TState, TStore, TLinkedBucketStore, TLinkedEntityStore
        >
    ): Reducer<TState | undefined, Action> {
        if (
            reduxCollectionReducerChildOptions?.extractEntities !== undefined &&
            (reduxCollectionReducerChildOptions.linkedIndexes?.length ?? 0) > 0
        ) {
            throw new Error(
                'OIMReduxReducerFactory.createCollectionReducer: linkedIndexes cannot be maintained ' +
                'alongside a custom extractEntities — the extractor does its own syncing, so which ' +
                'entities moved is not knowable here. Maintain the linked indexes inside the ' +
                'extractor, or drop extractEntities and use the default state shape.',
            );
        }
        const actualMapper = reducerEntry.mapper;

        // AN ENTITY'S OWN KEY IS THE ONLY KEY THIS REDUCER MAY HAND TO AN INDEX:
        // a record's keys are strings, and `'1'` addresses a second bucket
        // beside the engine's `1` without throwing.
        const keyOf: (entity: TEntity) => TPk =
            reduxCollectionReducerChildOptions?.keyOf ??
            ((entity: TEntity): TPk => {
                const named = entity as unknown as Record<string, unknown>;
                if ('id' in named) return named.id as TPk;
                throw new Error(
                    'Cannot determine primary key. Provide keyOf in child options'
                );
            });
        const linkedIndexesUpdater = new OIMReduxLinkedIndexesUpdater<TEntity>(keyOf);

        const readWholeState = (): TState => {
            reducerEntry.updatedKeys.clear();
            reducerEntry.forceRecompute = false;
            const wholeState = actualMapper(entityService, entityStoreSlot, new Set<TPk>(), undefined);
            this.updateLinkedIndexesForWholeState(
                reduxCollectionReducerChildOptions,
                wholeState,
                linkedIndexesUpdater
            );
            return wholeState;
        };

        return new OIMReduxChildAwareReducer<TState>({
            readInitialState: action =>
                action.type === EOIMReduxReducerActionType.UPDATE ||
                this.isReduxInitAction(action)
                    ? readWholeState()
                    // RTK-compatible: do not auto-initialize on a non-init action.
                    : undefined,

            readUpdatedState: previousState => {
                if (reducerEntry.forceRecompute) return readWholeState();
                if (reducerEntry.updatedKeys.size === 0) return previousState;

                const updatedKeys = new Set(reducerEntry.updatedKeys);
                const newState = actualMapper(entityService, entityStoreSlot, updatedKeys, previousState);
                reducerEntry.updatedKeys.clear();

                if (
                    reduxCollectionReducerChildOptions?.linkedIndexes &&
                    reduxCollectionReducerChildOptions.linkedIndexes.length > 0
                ) {
                    const oldReduxDefaultCollectionState = previousState as unknown as
                        | TOIMReduxDefaultCollectionState<TEntity, TPk>
                        | undefined;
                    const newReduxDefaultCollectionState = newState as unknown as
                        | TOIMReduxDefaultCollectionState<TEntity, TPk>
                        | undefined;
                    if (
                        oldReduxDefaultCollectionState &&
                        newReduxDefaultCollectionState &&
                        oimHasReduxStateField(oldReduxDefaultCollectionState, 'entities') &&
                        oimHasReduxStateField(newReduxDefaultCollectionState, 'entities')
                    ) {
                        // The diff's keys are spent HERE; entities travel on.
                        const reduxEntityKeysDiff = oimDiffEntityKeys(
                            oldReduxDefaultCollectionState.entities,
                            newReduxDefaultCollectionState.entities
                        );
                        const updatedEntities = collectEntitiesByName<TEntity>(
                            newReduxDefaultCollectionState.entities,
                            reduxEntityKeysDiff.added
                        ).concat(
                            collectEntitiesByName<TEntity>(
                                newReduxDefaultCollectionState.entities,
                                reduxEntityKeysDiff.updated
                            )
                        );
                        linkedIndexesUpdater.updateLinkedIndexesForEntities(
                            reduxCollectionReducerChildOptions.linkedIndexes,
                            updatedEntities
                        );
                        // Only the OLD state can still be read for a removed
                        // entity's own key.
                        const removedPks = collectEntitiesByName<TEntity>(
                            oldReduxDefaultCollectionState.entities,
                            reduxEntityKeysDiff.removed
                        ).map(keyOf);
                        linkedIndexesUpdater.removeLinkedIndexesByKeys(
                            reduxCollectionReducerChildOptions.linkedIndexes,
                            removedPks
                        );
                    }
                }

                return newState;
            },

            childSync: reduxCollectionReducerChildOptions === undefined ? undefined : {
                reducer: reduxCollectionReducerChildOptions.reducer,
                applyChildState: (previousState, childState) => {
                    if (reduxCollectionReducerChildOptions.extractEntities) {
                        reduxCollectionReducerChildOptions.extractEntities(
                            previousState,
                            childState,
                            entityService,
                            entityStoreSlot,
                            keyOf
                        );
                        return;
                    }

                    const defaultState = childState as unknown as
                        | TOIMReduxDefaultCollectionState<TEntity, TPk>
                        | undefined;
                    if (
                        !defaultState ||
                        !oimHasReduxStateField(defaultState, 'entities') ||
                        !oimHasReduxStateField(defaultState, 'ids')
                    ) {
                        return;
                    }

                    // The live engine state is the "old" snapshot. String-keyed
                    // on purpose: nothing may read a key back out of it.
                    const oldEntities: Record<string, TEntity> = {};
                    for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
                        const entity = entitySlot.entity;
                        if (entity === undefined) continue;
                        oldEntities[String(entitySlot.key)] = entity;
                    }

                    const reduxEntityKeysDiff = oimDiffEntityKeys(oldEntities, defaultState.entities);

                    const entitiesToUpsert = collectEntitiesByName<TEntity>(
                        defaultState.entities,
                        reduxEntityKeysDiff.added
                    ).concat(
                        collectEntitiesByName<TEntity>(defaultState.entities, reduxEntityKeysDiff.updated)
                    );
                    if (entitiesToUpsert.length > 0) {
                        entityService.slotContentService.upsertEntities(entityStoreSlot, entitiesToUpsert);
                    }

                    // Removal walks the IDENTITIES, never `reduxEntityKeysDiff.removed` — those
                    // are string keys, and a numeric population would remove
                    // nothing. THE WALK ONLY COLLECTS: `delete` edits the store for
                    // an unheld entity slot, so the deletes run after it, in one call.
                    const removedPks: TOIMStoreKey[] = [];
                    const removedSlots: TOIMEntitySlot<TEntity, TOIMStoreKey>[] = [];
                    for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
                        if (entitySlot.entity === undefined) continue;
                        if (entitySlot.key in defaultState.entities) continue;
                        removedPks.push(entitySlot.key);
                        removedSlots.push(entitySlot);
                    }
                    if (removedSlots.length > 0) entityService.slotContentService.deleteEntities(entityStoreSlot, removedSlots);

                    if (
                        reduxCollectionReducerChildOptions.linkedIndexes &&
                        reduxCollectionReducerChildOptions.linkedIndexes.length > 0
                    ) {
                        linkedIndexesUpdater.updateLinkedIndexesForEntities(
                            reduxCollectionReducerChildOptions.linkedIndexes,
                            entitiesToUpsert
                        );
                        linkedIndexesUpdater.removeLinkedIndexesByKeys(
                            reduxCollectionReducerChildOptions.linkedIndexes,
                            removedPks
                        );
                    }
                },
            },
        }).reduce;
    }

    /**
     * A from-scratch build has no old state to diff, and skipping it on those
     * grounds leaves the linked indexes empty until a later frame that may never
     * come.
     */
    private updateLinkedIndexesForWholeState<
        TEntity extends object,
        TPk extends TOIMStoreKey,
        TState,
        TStore,
        TLinkedBucketStore,
        TLinkedEntityStore,
    >(
        reduxCollectionReducerChildOptions: TOIMReduxCollectionReducerChildOptions<
            TEntity, TPk, TState, TStore, TLinkedBucketStore, TLinkedEntityStore
        > | undefined,
        state: TState | undefined,
        linkedIndexesUpdater: OIMReduxLinkedIndexesUpdater<TEntity>
    ): void {
        const linkedIndexes = reduxCollectionReducerChildOptions?.linkedIndexes;
        if (linkedIndexes === undefined || linkedIndexes.length === 0) return;

        // Only the default state shape carries `entities`; same guard as the
        // incremental path.
        const defaultState = state as unknown as
            | TOIMReduxDefaultCollectionState<TEntity, TPk>
            | undefined;
        if (!defaultState || !oimHasReduxStateField(defaultState, 'entities')) {
            return;
        }

        // `Object.keys` strings are spent here; the ENTITIES go on.
        const allEntities = collectEntitiesByName<TEntity>(
            defaultState.entities,
            Object.keys(defaultState.entities)
        );
        if (allEntities.length === 0) return;

        linkedIndexesUpdater.updateLinkedIndexesForEntities(linkedIndexes, allEntities);
    }

    public createKeyedIndexReducer<
        TIndexKey extends TOIMStoreKey,
        TPk extends TOIMStoreKey,
        TState,
        TEntity extends object,
        TBucketStore,
        TEntityStore,
    >(
        keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>,
        reducerEntry: TOIMReduxIndexReducerEntry<TIndexKey, TPk, TState, TEntity, TBucketStore, TEntityStore>,
        reduxIndexReducerChildOptions?: TOIMReduxIndexReducerChildOptions<
            TIndexKey, TPk, TState, TEntity, TBucketStore, TEntityStore
        >
    ): Reducer<TState | undefined, Action> {
        const actualMapper = reducerEntry.mapper;

        const readWholeState = (): TState => {
            reducerEntry.updatedKeys.clear();
            reducerEntry.forceRecompute = false;
            return actualMapper(keyedIndex, new Set<TIndexKey>(), undefined);
        };

        return new OIMReduxChildAwareReducer<TState>({
            readInitialState: () => readWholeState(),

            readUpdatedState: previousState => {
                if (reducerEntry.forceRecompute) return readWholeState();
                if (reducerEntry.updatedKeys.size === 0) return previousState;

                const updatedKeys = new Set(reducerEntry.updatedKeys);
                const newState = actualMapper(keyedIndex, updatedKeys, previousState);
                reducerEntry.updatedKeys.clear();
                return newState;
            },

            childSync: reduxIndexReducerChildOptions === undefined ? undefined : {
                reducer: reduxIndexReducerChildOptions.reducer,
                applyChildState: (previousState, childState) => {
                    if (reduxIndexReducerChildOptions.extractIndexState) {
                        reduxIndexReducerChildOptions.extractIndexState(
                            previousState,
                            childState,
                            keyedIndex
                        );
                        return;
                    }

                    const defaultState = childState as unknown as
                        | TOIMReduxDefaultIndexState<TIndexKey, TPk>
                        | undefined;
                    if (defaultState && oimHasReduxStateField(defaultState, 'entities')) {
                        this.syncIndexEntities(keyedIndex, defaultState.entities);
                    }
                },
            },
        }).reduce;
    }

    /** KEYS OFF `entry.id`, never off the record's own property name. */
    private syncIndexEntities<
        TIndexKey extends TOIMStoreKey, TPk extends TOIMStoreKey, TEntity extends object, TBucketStore, TEntityStore,
    >(
        keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>,
        entities: Record<TIndexKey, { id: TIndexKey; ids: TPk[] }>
    ): void {
        const listed = collectEntitiesByName<{ id: TIndexKey; ids: TPk[] }>(
            entities,
            Object.keys(entities)
        );
        const bucketService = keyedIndex.bucketService;
        const bucketContentService = bucketService.slotContentService;
        const seen = new Set<TOIMStoreKey>();
        for (let i = 0; i < listed.length; i++) {
            const entry = listed[i];
            seen.add(entry.id);
            const entitySlots: TOIMEntitySlot<TEntity, TOIMStoreKey>[] = [];
            for (let j = 0; j < entry.ids.length; j++) {
                entitySlots.push(keyedIndex.entityService.getSlotByKey(keyedIndex.entityStoreSlot, entry.ids[j]));
            }
            bucketContentService.writeBucketMemberSlots(bucketService.getSlotByKey(keyedIndex.bucketStoreSlot, entry.id), entitySlots);
        }

        for (const filedBucketSlot of bucketService.getSlots(keyedIndex.bucketStoreSlot)) {
            if (seen.has(filedBucketSlot.key)) continue;
            if (bucketContentService.getBucketMemberSlotCount(filedBucketSlot) === 0) continue;
            bucketContentService.writeBucketMemberSlots(filedBucketSlot, []);
        }
    }

    public createGlobalIndexReducer<
        TPk extends TOIMStoreKey, TState, TEntity extends object, TEntityStore, TBucketStore,
    >(
        globalIndex: TOIMReduxGlobalIndex<TPk, TEntity, TEntityStore, TBucketStore>,
        reducerEntry: TOIMReduxGlobalIndexReducerEntry<TPk, TState, TEntity, TEntityStore, TBucketStore>,
        reduxGlobalIndexReducerChildOptions?: TOIMReduxGlobalIndexReducerChildOptions<
            TPk, TState, TEntity, TEntityStore, TBucketStore
        >
    ): Reducer<TState | undefined, Action> {
        const actualMapper = reducerEntry.mapper;

        return new OIMReduxChildAwareReducer<TState>({
            readInitialState: () => {
                reducerEntry.dirty = false;
                return actualMapper(globalIndex, undefined);
            },

            readUpdatedState: previousState => {
                if (!reducerEntry.dirty) return previousState;
                const newState = actualMapper(globalIndex, previousState);
                reducerEntry.dirty = false;
                return newState;
            },

            childSync: reduxGlobalIndexReducerChildOptions === undefined ? undefined : {
                reducer: reduxGlobalIndexReducerChildOptions.reducer,
                applyChildState: (previousState, childState) => {
                    if (reduxGlobalIndexReducerChildOptions.extractGlobalIndexState) {
                        reduxGlobalIndexReducerChildOptions.extractGlobalIndexState(
                            previousState,
                            childState,
                            globalIndex
                        );
                        return;
                    }

                    const defaultState =
                        childState as unknown as TOIMReduxDefaultGlobalIndexState<TPk>;
                    if (!defaultState || !oimHasReduxStateField(defaultState, 'ids')) {
                        return;
                    }

                    // NO COLLIDING-KEY REFUSAL HERE, unlike the two mappers:
                    // `ids` is an ARRAY, so nothing is lost and a symmetric
                    // guard would reject a state this path represents exactly.
                    const entitySlots: TOIMEntitySlot<TEntity, TOIMStoreKey>[] = [];
                    for (let i = 0; i < defaultState.ids.length; i++) {
                        entitySlots.push(
                            globalIndex.entityService.getSlotByKey(globalIndex.entityStoreSlot, defaultState.ids[i])
                        );
                    }
                    globalIndex.bucketService.slotContentService.writeBucketMemberSlots(globalIndex.bucketSlot, entitySlots);
                },
            },
        }).reduce;
    }
}
