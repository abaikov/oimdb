import type { IOIMSlotReleasePolicy } from '../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { OIMSlotCollectionService } from '../../facade/slot/OIMSlotCollectionService';

export type TOIMIndexServiceFactoryOptions<TEntity extends object, TSourceKey, TSourceStore> = {
    entityService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
    columnNames?: readonly string[] | undefined;
};
