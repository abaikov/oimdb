import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import { createOIMSingleSlotService } from './createOIMSingleSlotService';

export function createOIMSingleSlotStoreAggregate<TSlotContentService extends object, TColumnName extends string = string>(
    channelMap: IOIMChannelMap,
    options: Parameters<typeof createOIMSingleSlotService<TSlotContentService, TColumnName>>[0],
): ReturnType<ReturnType<typeof createOIMSingleSlotService<TSlotContentService, TColumnName>>['createStoreAggregate']> {
    const singleSlotService = createOIMSingleSlotService<TSlotContentService, TColumnName>(options);
    return singleSlotService.createStoreAggregate(singleSlotService.createStoreSlot(channelMap));
}
