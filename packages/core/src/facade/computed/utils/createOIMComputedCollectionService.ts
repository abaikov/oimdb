import type { OIMColumnOwnerPullDriven } from '../../../engine/column/OIMColumnOwnerPullDriven';
import type { TOIMColumnOwnerOptions } from '../../../engine/column/types/TOIMColumnOwnerOptions';
import type { TOIMComputedColumnSlot } from '../../../engine/column/types/TOIMComputedColumnSlot';
import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { OIMComputedValueService } from '../../../engine/computed/OIMComputedValueService';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMSlotContentComputedStrategyOptions } from '../../../engine/computed/types/TOIMSlotContentComputedStrategyOptions';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSlotContentStrategy } from '../../../engine/slot/interfaces/IOIMSlotContentStrategy';
import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import { createOIMColumnOwnerPullDriven } from '../../../engine/column/utils/createOIMColumnOwnerPullDriven';
import { OIMSlotContentComputedStrategy } from '../../../engine/computed/OIMSlotContentComputedStrategy';
import { OIMSlotOwnerService } from '../../../engine/slot/OIMSlotOwnerService';
import { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';

export function createOIMComputedCollectionService<
    TKey, TValue, TComputedSlot extends TOIMComputedSlot<TValue, TKey>, TComputedStore, TColumnName extends string,
>(
    options: TOIMSlotContentComputedStrategyOptions<TKey, TValue> & {
        computedValueService: OIMComputedValueService<TKey, TValue>;
        slotReleasePolicy: IOIMSlotReleasePolicy;
        computedSlotStoreService: IOIMSlotStoreService<TKey, TComputedSlot, TComputedStore>;
        columnOwnerOptions: TOIMColumnOwnerOptions<TOIMComputedColumnSlot, TColumnName>;
        storeSlotListener: IOIMStoreSlotListener | undefined;
    },
): OIMSlotCollectionService<
    TKey, TComputedSlot, TComputedStore, OIMComputedValueService<TKey, TValue>,
    TColumnName, TOIMComputedColumnSlot, OIMColumnOwnerPullDriven
> {
    const slotOwnerService = new OIMSlotOwnerService<
        TKey, TComputedSlot, TComputedStore, TColumnName, TOIMComputedColumnSlot, OIMColumnOwnerPullDriven
    >({
        slotReleasePolicy: options.slotReleasePolicy,
        slotStoreService: options.computedSlotStoreService,
        slotContentStrategy: new OIMSlotContentComputedStrategy<TKey, TValue>(options) as IOIMSlotContentStrategy<
            TOIMComputedSlot<TValue, TKey>, TKey
        > as IOIMSlotContentStrategy<TComputedSlot, TKey>,
        columnOwnerOptions: options.columnOwnerOptions,
        createColumnOwner: createOIMColumnOwnerPullDriven,
    });
    return new OIMSlotCollectionService({
        slotOwnerService,
        slotStoreService: options.computedSlotStoreService,
        slotContentService: options.computedValueService,
        storeSlotListener: options.storeSlotListener,
    });
}
