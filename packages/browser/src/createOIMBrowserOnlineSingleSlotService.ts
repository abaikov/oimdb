import type { TOIMBrowserOnlineEntity } from './types/TOIMBrowserOnlineEntity';
import type { TOIMBrowserSingleSlotService } from './types/TOIMBrowserSingleSlotService';
import type { TOIMBrowserSingleSlotServiceOptions } from './types/TOIMBrowserSingleSlotServiceOptions';
import { OIMBrowserOnlineSlotSubscriptionListener } from './OIMBrowserOnlineSlotSubscriptionListener';
import { createOIMBrowserSingleSlotService } from './createOIMBrowserSingleSlotService';

export function createOIMBrowserOnlineSingleSlotService(options: TOIMBrowserSingleSlotServiceOptions = {}): TOIMBrowserSingleSlotService<TOIMBrowserOnlineEntity> {
    return createOIMBrowserSingleSlotService<TOIMBrowserOnlineEntity>(slotContentEntityService => new OIMBrowserOnlineSlotSubscriptionListener(slotContentEntityService), options);
}
