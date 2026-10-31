import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { TOIMSlotContentServiceKey } from './types/TOIMSlotContentServiceKey';
import type { TOIMSlotContentServiceSlot } from './types/TOIMSlotContentServiceSlot';
import { createOIMSlotCollectionService } from './createOIMSlotCollectionService';

export function createOIMSlotCollectionStoreAggregate<
    TSlotContentService extends object,
    TStore = Map<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>,
    TColumnName extends string = string,
>(
    channelMap: IOIMChannelMap,
    options: Parameters<typeof createOIMSlotCollectionService<TSlotContentService, TStore, TColumnName>>[0],
): ReturnType<ReturnType<typeof createOIMSlotCollectionService<TSlotContentService, TStore, TColumnName>>['createStoreAggregate']> {
    const slotCollectionService = createOIMSlotCollectionService<TSlotContentService, TStore, TColumnName>(options);
    return slotCollectionService.createStoreAggregate(slotCollectionService.createStoreSlot(channelMap));
}
