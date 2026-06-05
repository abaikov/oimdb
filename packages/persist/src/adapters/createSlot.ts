import { TOIMAnyEntitySlot, TOIMPk } from '@oimdb/core';

/**
 * Builds a placeholder slot from a bare primary key. Index snapshots store only
 * PKs, so on hydrate we rebuild slots whose `item` is resolved lazily elsewhere.
 */
export function createSlot<TPk extends TOIMPk>(
    pk: TPk
): TOIMAnyEntitySlot<TPk> {
    return { pk, item: undefined };
}
