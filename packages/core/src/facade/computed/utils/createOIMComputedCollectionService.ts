import type { OIMPullColumnSlotOwner } from '../../../engine/column/OIMPullColumnSlotOwner';
import type { TOIMColumnSlotOwnerOptions } from '../../../engine/column/types/TOIMColumnSlotOwnerOptions';
import type { TOIMComputedColumnSlot } from '../../../engine/column/types/TOIMComputedColumnSlot';
import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMSlotContentComputedServiceOptions } from '../../../engine/computed/types/TOIMSlotContentComputedServiceOptions';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import { createOIMPullColumnSlotOwner } from '../../../engine/column/utils/createOIMPullColumnSlotOwner';
import { OIMSlotContentComputedService } from '../../../engine/computed/OIMSlotContentComputedService';
import { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';

export function createOIMComputedCollectionService<
    TKey extends NonNullable<unknown>, TValue, TComputedSlot extends TOIMComputedSlot<TValue, TKey>, TComputedStore,
    TColumnName extends string,
>(
    options: TOIMSlotContentComputedServiceOptions<TValue, TComputedSlot> & {
        slotReleasePolicy: IOIMSlotReleasePolicy;
        computedSlotStoreService: IOIMSlotStoreService<TKey, TComputedSlot, TComputedStore>;
        columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot, TColumnName>;
        storeSlotListener: IOIMStoreSlotListener | undefined;
    },
): OIMSlotCollectionService<
    TKey, TComputedSlot, TComputedStore, OIMSlotContentComputedService<TValue, TComputedSlot>,
    TColumnName, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
> {
    return new OIMSlotCollectionService<
        TKey, TComputedSlot, TComputedStore, OIMSlotContentComputedService<TValue, TComputedSlot>,
        TColumnName, TOIMComputedColumnSlot, OIMPullColumnSlotOwner
    >({
        slotReleasePolicy: options.slotReleasePolicy,
        slotStoreService: options.computedSlotStoreService,
        slotContentService: new OIMSlotContentComputedService<TValue, TComputedSlot>(options),
        columnSlotOwnerOptions: options.columnSlotOwnerOptions,
        createColumnSlotOwner: createOIMPullColumnSlotOwner,
        storeSlotListener: options.storeSlotListener,
    });
}
