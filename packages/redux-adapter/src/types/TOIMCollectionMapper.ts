import { OIMReactiveCollection } from '@oimdb/core';
import { TOIMPk } from '@oimdb/core';

/**
 * Mapper function for converting collection state to Redux state
 * @param collection - The reactive collection
 * @param updatedKeys - Set of primary keys that were updated
 * @param currentState - Current Redux state (undefined on first call)
 * @returns New Redux state
 */
export type TOIMCollectionMapper<
    TEntity extends object,
    TPk extends TOIMPk,
    TState,
> = (
    collection: OIMReactiveCollection<TEntity, TPk>,
    updatedKeys: Set<TPk>,
    currentState: TState | undefined
) => TState;
