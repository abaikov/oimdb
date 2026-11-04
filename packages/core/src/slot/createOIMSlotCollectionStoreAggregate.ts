import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMSlotContentServiceKey } from './types/TOIMSlotContentServiceKey';
import type { TOIMSlotContentServiceSlot } from './types/TOIMSlotContentServiceSlot';
import type { TOIMSlotContentServiceContent } from './types/TOIMSlotContentServiceContent';
import type { TOIMSlotCollectionServiceFactoryOptions } from './types/TOIMSlotCollectionServiceFactoryOptions';
import { createOIMSlotCollectionService } from './createOIMSlotCollectionService';

export function createOIMSlotCollectionStoreAggregate<
    TSlotContentService extends object,
    TStore = Map<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>,
    TColumnName extends string = string,
    TKey extends NonNullable<unknown> = TOIMSlotContentServiceKey<TSlotContentService>,
    TSlot extends TOIMKeyedSlot<TKey> = TOIMSlotContentServiceSlot<TSlotContentService>,
    TContent = TOIMSlotContentServiceContent<TSlotContentService>,
>(
    channelMap: IOIMChannelMap,
    options: TOIMSlotCollectionServiceFactoryOptions<TSlotContentService, TStore, TColumnName, TKey, TSlot, TContent>,
): ReturnType<ReturnType<typeof createOIMSlotCollectionService<TSlotContentService, TStore, TColumnName, TKey, TSlot, TContent>>['createStoreAggregate']> {
    const slotCollectionService = createOIMSlotCollectionService<TSlotContentService, TStore, TColumnName, TKey, TSlot, TContent>(options);
    return slotCollectionService.createStoreAggregate(slotCollectionService.createStoreSlot(channelMap));
}
