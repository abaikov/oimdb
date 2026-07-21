import { Reducer, Action } from 'redux';
import {
    TOIMKey,
    OIMReactiveCollection,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
} from '@oimdb/core';

/**
 * Linked index configuration for automatic index updates
 */
export type TOIMDBReduxLinkedIndex<
    TEntity extends object,
    TPk extends TOIMKey,
    TIndexKey extends TOIMKey,
> = {
    /**
     * Reactive index to update automatically
     */
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
          >;
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
export type TOIMDBReduxCollectionReducerChildOptions<
    TEntity extends object,
    TPk extends TOIMKey,
    TState,
> = {
    /**
     * Child reducer that handles custom actions
     * Should return new state when action is handled, or return current state unchanged
     * Can be either Reducer<TState, Action> (RTK slice style) or Reducer<TState | undefined, Action>
     * If reducer doesn't accept undefined, factory will handle undefined state automatically
     */
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;

    /**
     * Function to extract entities from Redux state and sync them to OIMDB collection
     * Should directly update the collection using upsertMany/removeMany
     * If not provided, default implementation will be used for TOIMDBReduxDefaultCollectionState
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
     *
     * Note: The index type accepts any TIndexKey that extends TOIMKey.
     * TypeScript will infer the specific key type (e.g., string) from the actual index instance,
     * allowing indexes with specific key types to be used even when TPk is a union type.
     */
    linkedIndexes?: Array<{
        index:
            | OIMReactiveIndexSetBased<
                  TOIMKey,
                  TPk,
                  OIMIndexSetBased<TOIMKey, TPk>
              >
            | OIMReactiveIndexArrayBased<
                  TOIMKey,
                  TPk,
                  OIMIndexArrayBased<TOIMKey, TPk>
              >
            | OIMReactiveIndexSetBased<
                  string,
                  TPk,
                  OIMIndexSetBased<string, TPk>
              >
            | OIMReactiveIndexArrayBased<
                  string,
                  TPk,
                  OIMIndexArrayBased<string, TPk>
              >
            | OIMReactiveIndexSetBased<
                  number,
                  TPk,
                  OIMIndexSetBased<number, TPk>
              >
            | OIMReactiveIndexArrayBased<
                  number,
                  TPk,
                  OIMIndexArrayBased<number, TPk>
              >;
        fieldName: keyof TEntity;
    }>;
};
