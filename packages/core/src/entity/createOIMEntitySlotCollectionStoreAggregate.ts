import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { OIMDefaults } from '../db/OIMDefaults';
import type { OIMEntityContentService } from './OIMEntityContentService';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import { createOIMEntityContentService } from './createOIMEntityContentService';
import { createOIMSlotCollectionStoreAggregate } from '../slot/createOIMSlotCollectionStoreAggregate';

export function createOIMEntitySlotCollectionStoreAggregate<
    TEntity extends object,
    TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>,
>(
    channelMap: IOIMChannelMap,
    options: {
        defaults?: OIMDefaults | undefined;
        entityWriter?: IOIMEntityWriter | undefined;
        slotEmptinessPolicy?: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot<TEntity>> | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly TColumnName[] | undefined;
    } = {},
): ReturnType<typeof createOIMSlotCollectionStoreAggregate<
    OIMEntityContentService<TEntity, TOIMStoreKey, TColumnName>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TColumnName
>> {
    return createOIMSlotCollectionStoreAggregate<
        OIMEntityContentService<TEntity, TOIMStoreKey, TColumnName>, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TColumnName
    >(channelMap, {
        defaults: options.defaults,
        slotContentService: createOIMEntityContentService<TEntity, TOIMStoreKey, TColumnName>(options),
        slotReleasePolicy: options.slotReleasePolicy,
        slotSubscriptionListener: options.slotSubscriptionListener,
        columnSlotStoreService: options.columnSlotStoreService,
        columnNames: options.columnNames,
    });
}
