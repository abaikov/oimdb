import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../../slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';
import type { TOIMColumnGroup } from '../../column/types/TOIMColumnGroup';
import type { OIMDefaults } from '../../db/OIMDefaults';

export type TOIMSlotCollectionIndexServiceFactoryOptions<TEntity extends object, TSourceKey extends NonNullable<unknown>, TSourceStore> = {
    entityService: Pick<OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>, 'getSlots'>;
    defaults?: OIMDefaults | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
    columnNames?: readonly string[] | undefined;
    columnGroups?: readonly TOIMColumnGroup[] | undefined;
};
