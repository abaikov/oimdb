import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { oimGetAllRootSlots } from './oimGetAllRootSlots';

export function oimMergeRootSlots(
    sourceSlots: readonly TOIMSlot[],
    sourceComputeds: readonly TOIMComputedSlot[],
): readonly TOIMSlot[] {
    if (sourceComputeds.length === 0) return sourceSlots;
    if (sourceComputeds.length === 1 && sourceSlots.length === 0) return oimGetAllRootSlots(sourceComputeds[0]);
    const mergedRootSlots: TOIMSlot[] = [];
    for (let i = 0; i < sourceSlots.length; i++) mergedRootSlots.push(sourceSlots[i]);
    for (let i = 0; i < sourceComputeds.length; i++) {
        const computedRootSlots = oimGetAllRootSlots(sourceComputeds[i]);
        for (let j = 0; j < computedRootSlots.length; j++) mergedRootSlots.push(computedRootSlots[j]);
    }
    return mergedRootSlots;
}
