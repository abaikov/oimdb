import type { IOIMSlotReleasePolicy } from '../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../../engine/slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import type { OIMSlotCollectionService } from '../../facade/slot/OIMSlotCollectionService';

export type TOIMSlotCollectionIndexServiceFactoryOptions<TEntity extends object, TSourceKey extends NonNullable<unknown>, TSourceStore> = {
    entityService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
    columnNames?: readonly string[] | undefined;
};
