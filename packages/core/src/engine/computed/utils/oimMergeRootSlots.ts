import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { oimGetAllRootSlots } from './oimGetAllRootSlots';

const scannedRootSlotLimit = 16;

export function oimMergeRootSlots(
    sourceSlots: readonly TOIMSlot[],
    sourceComputeds: readonly TOIMComputedSlot[],
): readonly TOIMSlot[] {
    if (sourceComputeds.length === 0) return sourceSlots;
    if (sourceComputeds.length === 1 && sourceSlots.length === 0) return oimGetAllRootSlots(sourceComputeds[0]);
    const mergedRootSlots: TOIMSlot[] = [];
    let distinctRootSlots: Set<TOIMSlot> | undefined;
    for (let i = 0; i < sourceSlots.length; i++) {
        distinctRootSlots = pushIfAbsent(mergedRootSlots, distinctRootSlots, sourceSlots[i]);
    }
    for (let i = 0; i < sourceComputeds.length; i++) {
        const computedRootSlots = oimGetAllRootSlots(sourceComputeds[i]);
        for (let j = 0; j < computedRootSlots.length; j++) {
            distinctRootSlots = pushIfAbsent(mergedRootSlots, distinctRootSlots, computedRootSlots[j]);
        }
    }
    return mergedRootSlots;
}

function pushIfAbsent(
    mergedRootSlots: TOIMSlot[], distinctRootSlots: Set<TOIMSlot> | undefined, rootSlot: TOIMSlot,
): Set<TOIMSlot> | undefined {
    if (distinctRootSlots !== undefined) {
        if (distinctRootSlots.has(rootSlot)) return distinctRootSlots;
        distinctRootSlots.add(rootSlot);
        mergedRootSlots.push(rootSlot);
        return distinctRootSlots;
    }
    if (mergedRootSlots.indexOf(rootSlot) !== -1) return undefined;
    mergedRootSlots.push(rootSlot);
    return mergedRootSlots.length > scannedRootSlotLimit ? new Set(mergedRootSlots) : undefined;
}
