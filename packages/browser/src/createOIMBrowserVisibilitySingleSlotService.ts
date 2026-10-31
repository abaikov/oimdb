import type { TOIMBrowserVisibilityEntity } from './types/TOIMBrowserVisibilityEntity';
import type { TOIMBrowserSingleSlotService } from './types/TOIMBrowserSingleSlotService';
import type { TOIMBrowserSingleSlotServiceOptions } from './types/TOIMBrowserSingleSlotServiceOptions';
import { OIMBrowserVisibilitySlotSubscriptionListener } from './OIMBrowserVisibilitySlotSubscriptionListener';
import { createOIMBrowserSingleSlotService } from './createOIMBrowserSingleSlotService';

export function createOIMBrowserVisibilitySingleSlotService(options: TOIMBrowserSingleSlotServiceOptions = {}): TOIMBrowserSingleSlotService<TOIMBrowserVisibilityEntity> {
    return createOIMBrowserSingleSlotService<TOIMBrowserVisibilityEntity>(slotContentEntityService => new OIMBrowserVisibilitySlotSubscriptionListener(slotContentEntityService), options);
}
