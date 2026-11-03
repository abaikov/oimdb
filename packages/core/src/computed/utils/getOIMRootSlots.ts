import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';
import { mergeOIMRootSlots } from './mergeOIMRootSlots';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export function getOIMRootSlots(computedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>): readonly TOIMSlot[] {
    const sourceComputeds = computedSlot.sourceComputeds;
    if (computedSlot.sourceSlots.length === 0 && sourceComputeds.length === 1) return getOIMRootSlots(sourceComputeds[0]);
    const rootSlots = computedSlot.rootSlots;
    if (rootSlots !== undefined) return rootSlots;
    const mergedRootSlots = mergeOIMRootSlots(computedSlot.sourceSlots, sourceComputeds);
    (computedSlot as TOIMEditable<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>>).rootSlots = mergedRootSlots;
    return mergedRootSlots;
}
