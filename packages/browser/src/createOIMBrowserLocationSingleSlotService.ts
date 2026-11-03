import type { TOIMBrowserLocationEntity } from './types/TOIMBrowserLocationEntity';
import type { TOIMBrowserSingleSlotService } from './types/TOIMBrowserSingleSlotService';
import type { TOIMBrowserSingleSlotServiceOptions } from './types/TOIMBrowserSingleSlotServiceOptions';
import { OIMBrowserLocationSlotSubscriptionListener } from './OIMBrowserLocationSlotSubscriptionListener';
import { createOIMBrowserSingleSlotService } from './createOIMBrowserSingleSlotService';

export function createOIMBrowserLocationSingleSlotService(options: TOIMBrowserSingleSlotServiceOptions = {}): TOIMBrowserSingleSlotService<TOIMBrowserLocationEntity> {
    return createOIMBrowserSingleSlotService<TOIMBrowserLocationEntity>(browserSlotSubscriptionListenerOptions => new OIMBrowserLocationSlotSubscriptionListener(browserSlotSubscriptionListenerOptions), options);
}
