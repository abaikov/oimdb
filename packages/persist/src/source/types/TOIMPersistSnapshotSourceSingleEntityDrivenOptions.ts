import type { IOIMChannelMap, TOIMEntityContentSlot, TOIMSingleSlotStoreSlot } from '@oimdb/core';
import type { TOIMPersistSingleEntityService } from './TOIMPersistSingleEntityService';

export type TOIMPersistSnapshotSourceSingleEntityDrivenOptions<TEntity extends object> = {
    readonly channelMap: IOIMChannelMap;
    readonly singleSlotService: TOIMPersistSingleEntityService<TEntity>;
    readonly entityStoreSlot: TOIMSingleSlotStoreSlot<TOIMEntityContentSlot<TEntity>>;
};
