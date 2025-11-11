import { Reducer, Action } from 'redux';
import { TOIMPk, OIMReactiveCollection, OIMReactiveIndex, OIMIndex } from '@oimdb/core';

/**
 * Linked index configuration for automatic index updates
 */
export type TOIMLinkedIndex<
    TEntity extends object,
    TPk extends TOIMPk,
    TIndexKey extends TOIMPk,
> = {
    /**
     * Reactive index to update automatically
     */
    index: OIMReactiveIndex<TIndexKey, TPk, OIMIndex<TIndexKey, TPk>>;
    /**
     * Field name in entity that contains an array of PKs
     * When this field changes (by reference), the index will be updated
     * The entity's PK will be used as the index key, and the array values as index values
     * Example: deck.cardIds -> index[deck.id] = cardIds
     */
    fieldName: keyof TEntity;
};

/**
 * Options for child reducer that can handle custom actions
 * and sync changes back to OIMDB
 */
export type TOIMCollectionReducerChildOptions<
    TEntity extends object,
    TPk extends TOIMPk,
    TState,
> = {
    /**
     * Child reducer that handles custom actions
     * Should return new state when action is handled, or return current state unchanged
     * Must handle undefined state (for Redux combineReducers compatibility)
     */
    reducer: Reducer<TState | undefined, Action>;

    /**
     * Function to extract entities from Redux state and sync them to OIMDB collection
     * Should directly update the collection using upsertMany/removeMany
     * If not provided, default implementation will be used for TOIMDefaultCollectionState
     * @param prevState - Previous Redux state (undefined on first call)
     * @param nextState - New Redux state after child reducer processed action
     * @param collection - The OIMDB collection to sync with
     * @param getPk - Function to extract primary key from entity
     */
    extractEntities?: (
        prevState: TState | undefined,
        nextState: TState,
        collection: OIMReactiveCollection<TEntity, TPk>,
        getPk: (entity: TEntity) => TPk
    ) => void;

    /**
     * Optional function to extract primary key from entity
     * If not provided, will try to use 'id' property
     */
    getPk?: (entity: TEntity) => TPk;

    /**
     * Linked indexes that will be automatically updated when entities change
     * When an entity's field (specified by fieldName) changes by reference,
     * the index will be updated: old key will be removed, new key will be added
     */
    linkedIndexes?: Array<TOIMLinkedIndex<TEntity, TPk, TOIMPk>>;
};

