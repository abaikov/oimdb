import type { OIMPullColumnSlotOwner } from '../../column/OIMPullColumnSlotOwner';
import type { TOIMColumnSlotOwnerOptions } from '../../column/types/TOIMColumnSlotOwnerOptions';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { OIMComputedContentService } from '../OIMComputedContentService';
import type { OIMSourceTracker } from '../OIMSourceTracker';
import { createOIMPullColumnSlotOwner } from '../../column/utils/createOIMPullColumnSlotOwner';
import { OIMSlotCollectionService } from '../../slot/OIMSlotCollectionService';

export function createOIMComputedSlotCollectionService<
    TKey extends NonNullable<unknown>, TValue, TComputedSlot extends TOIMComputedSlot<TValue, TKey, OIMSourceTracker | undefined>,
    TComputedStore, TColumnName extends string, TComputedContentService extends OIMComputedContentService<TValue, TComputedSlot> = OIMComputedContentService<TValue, TComputedSlot>,
>(
    options: {
        slotContentService: TComputedContentService;
        slotReleasePolicy: IOIMSlotReleasePolicy;
        computedSlotStoreService: IOIMSlotStoreService<TKey, TComputedSlot, TComputedStore>;
        columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot, TColumnName>;
        storeSlotListener: IOIMStoreSlotListener | undefined;
    },
): OIMSlotCollectionService<TKey, TComputedSlot, TComputedStore, TComputedContentService, TColumnName, TOIMComputedColumnSlot, OIMPullColumnSlotOwner> {
    return new OIMSlotCollectionService<TKey, TComputedSlot, TComputedStore, TComputedContentService, TColumnName, TOIMComputedColumnSlot, OIMPullColumnSlotOwner>({
        slotReleasePolicy: options.slotReleasePolicy,
        slotStoreService: options.computedSlotStoreService,
        slotContentService: options.slotContentService,
        columnSlotOwnerOptions: options.columnSlotOwnerOptions,
        createColumnSlotOwner: createOIMPullColumnSlotOwner,
        storeSlotListener: options.storeSlotListener,
    });
}
