import type { TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxDefaultCollectionState } from '../types/TOIMReduxDefaultCollectionState';
import type { TOIMReduxEntityCollectionService } from '../types/TOIMReduxEntityCollectionService';

// The collision refused here loses a row BOTH ways — outward, and back into the
// engine, where deleting one entry removes two rows.
function collidingKeysError(key: TOIMStoreKey, claimedByStoreKey: TOIMStoreKey): Error {
    return new Error(
        `oimDefaultCollectionMapper: primary keys ${JSON.stringify(claimedByStoreKey)} and ` +
        `${JSON.stringify(key)} are two rows in the collection and one property ` +
        `name in the Redux state, which cannot hold both — the row that loses is ` +
        `missing from \`entities\` while \`ids\` still lists it, and a child ` +
        `reducer deleting that one entry removes BOTH rows from the collection. ` +
        `Address the collection with a single key type, or supply a mapper whose ` +
        `state shape keeps the two apart.`
    );
}

export function oimDefaultCollectionMapper<
    TEntity extends object,
    TPk extends TOIMStoreKey,
    TStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
>(
    entityService: TOIMReduxEntityCollectionService<TEntity, TStore>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>,
    updatedKeys: Set<TPk>,
    currentState?: TOIMReduxDefaultCollectionState<TEntity, TPk>
): TOIMReduxDefaultCollectionState<TEntity, TPk> {
    if (!currentState) {
        const entities = {} as Record<TPk, TEntity>;
        const ids: TPk[] = [];
        // Property name -> the raw pk that wrote it.
        const claimedBy = {} as Record<TPk, TPk>;
        for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
            if (entitySlot.entity === undefined) continue;
            const pk = entitySlot.key as TPk;
            // Every entity slot appears once here, so a claimed name means a second key.
            const claimant: TPk | undefined = claimedBy[pk];
            if (claimant !== undefined) throw collidingKeysError(pk, claimant);
            claimedBy[pk] = pk;
            entities[pk] = entitySlot.entity as TEntity;
            ids.push(pk);
        }
        return { entities, ids };
    }

    const newEntities = { ...currentState.entities };
    const removedKeys = new Set<TPk>();
    const addedPks: TPk[] = [];
    // Sized by `updatedKeys`, not by the state: the names this call does NOT
    // write are checked from the other side, in the `ids` walk below.
    const claimedBy = {} as Record<TPk, TPk>;

    for (const pk of updatedKeys) {
        // Catches both forms arriving in the SAME frame; the second write would
        // otherwise replace the first row's entry.
        const claimant: TPk | undefined = claimedBy[pk];
        if (claimant !== undefined) throw collidingKeysError(pk, claimant);
        claimedBy[pk] = pk;
        // A key that reached this loop may have just been removed; the read mints it
        // back empty, `entity` is undefined, and the collector takes the mint.
        const entity = entityService.getSlotByKey(entityStoreSlot, pk).entity;
        if (entity !== undefined) {
            if (!(pk in newEntities)) addedPks.push(pk);
            newEntities[pk] = entity;
        } else if (pk in newEntities) {
            delete newEntities[pk];
            removedKeys.add(pk);
        }
    }

    const newIds: TPk[] = [];
    for (let i = 0; i < currentState.ids.length; i++) {
        const id = currentState.ids[i];
        // The other half of the guard. The collection is asked whether the id
        // still names a row ONLY once a name is in dispute: a stale spelling is
        // not a second row.
        const claimant: TPk | undefined = claimedBy[id];
        if (
            claimant !== undefined &&
            claimant !== id &&
            entityService.getSlotByKey(entityStoreSlot, id).entity !== undefined
        ) {
            throw collidingKeysError(id, claimant);
        }
        if (!removedKeys.has(id)) newIds.push(id);
    }
    for (let i = 0; i < addedPks.length; i++) newIds.push(addedPks[i]);

    return { entities: newEntities, ids: newIds };
}
