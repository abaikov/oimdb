import type { TOIMBrowserFocusEntity } from './types/TOIMBrowserFocusEntity';
import type { TOIMBrowserSingleSlotService } from './types/TOIMBrowserSingleSlotService';
import type { TOIMBrowserSingleSlotServiceOptions } from './types/TOIMBrowserSingleSlotServiceOptions';
import { OIMBrowserFocusSlotSubscriptionListener } from './OIMBrowserFocusSlotSubscriptionListener';
import { createOIMBrowserSingleSlotService } from './createOIMBrowserSingleSlotService';

export function createOIMBrowserFocusSingleSlotService(options: TOIMBrowserSingleSlotServiceOptions = {}): TOIMBrowserSingleSlotService<TOIMBrowserFocusEntity> {
    return createOIMBrowserSingleSlotService<TOIMBrowserFocusEntity>(entityContentService => new OIMBrowserFocusSlotSubscriptionListener(entityContentService), options);
}
