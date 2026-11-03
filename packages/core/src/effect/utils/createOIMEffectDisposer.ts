import type { IOIMChannelMap } from '../../channel/interfaces/IOIMChannelMap';
import type { TOIMEffectBody } from '../types/TOIMEffectBody';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMComputedContentSlot } from '../../computed/types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../../computed/OIMSourceTracker';
import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import type { TOIMEffect } from '../types/TOIMEffect';
import { OIMEffectService } from '../OIMEffectService';
import { swapOIMActiveSourceTracker } from '../../computed/utils/swapOIMActiveSourceTracker';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from '../../computed/constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';

export function createOIMEffectDisposer(
    channelMap: IOIMChannelMap,
    body: TOIMEffectBody,
    sourceSlots: readonly TOIMSlot[],
    sourceComputeds: readonly TOIMComputedContentSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
    sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
): TOIMDisposer {
    const outerSourceTracker = swapOIMActiveSourceTracker(undefined);
    let effect: TOIMEffect;
    try {
        effect = OIMEffectService.INSTANCE.createAndRunEffect(channelMap, body, sourceSlots, sourceComputeds, sourceTrackingComputeds);
    } finally {
        swapOIMActiveSourceTracker(outerSourceTracker);
    }
    return () => { OIMEffectService.INSTANCE.disposeEffect(effect); };
}
