import type { OIMSourceTracker, TOIMSlot, TOIMComputedContentSlot } from '@oimdb/core';
import { computed as computedIn } from '../soimdb/computed';
import { getInstance } from './getInstance';

export function computed<TValue>(
    derive: () => TValue,
    sourceSlots?: readonly (TOIMSlot & { readonly value?: never })[],
): TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> {
    return computedIn(getInstance(), derive, sourceSlots);
}
