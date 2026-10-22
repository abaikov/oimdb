import { useMemo } from 'react';
import type {
    OIMSlotCollectionService, TOIMEntitySlot, TOIMEntityColumnName, TOIMEntityColumnValue, TOIMDisposer, TOIMSlot,
    TOIMColumnSlot, TOIMStoreKey,
} from '@oimdb/core';
import { holdWhileSubscribed } from './holdWhileSubscribed';
import { oimAssertOneChannel } from './oimAssertOneChannel';
import { useOIMDB } from './useOIMDB';
import { OIMSnapshotVersion } from './OIMSnapshotVersion';
import { useOIMSnapshotVersion } from './useOIMSnapshotVersion';

/**
 * One field of one identity. It cannot go through {@link useOIMValue}: a column identity is
 * minted INSIDE the subscription, so there is no root slot a binding could name. `slot` is an
 * ENTITY SLOT because an entity slot is what can be taken out from under this component — ../README.md.
 */
export function useOIMField<TEntity extends object, TName extends TOIMEntityColumnName<TEntity>, TKey = TOIMStoreKey>(
    entityCollectionService: Pick<
        OIMSlotCollectionService<TKey, TOIMEntitySlot<TEntity, TKey>, unknown, unknown, TName, TOIMColumnSlot>, 'getColumn'
    >,
    slot: TOIMEntitySlot<TEntity, TKey>,
    name: TName,
): TOIMEntityColumnValue<TEntity, TName> | undefined {
    const db = useOIMDB();
    const store = useMemo(() => {
        oimAssertOneChannel(db, slot, 'useOIMField');
        const holds: readonly TOIMSlot[] = [slot];
        const snapshotVersion = new OIMSnapshotVersion();
        return {
            snapshotVersion,
            subscribe: (onStoreChange: () => void): TOIMDisposer =>
                holdWhileSubscribed(holds, (): TOIMDisposer => snapshotVersion.subscribeEffect(
                    db, [entityCollectionService.getColumn(slot, name)], [], onStoreChange,
                )),
        };
    }, [db, entityCollectionService, slot, name]);

    useOIMSnapshotVersion(store.snapshotVersion, store.subscribe);
    // The column holds no value; what moved is on the entity slot. `TOIMEntityColumnName` is a deferred
    // conditional type, so nothing here can index `TEntity` by it.
    return (slot.entity as Record<string, unknown> | undefined)?.[name] as
        TOIMEntityColumnValue<TEntity, TName> | undefined;
}
