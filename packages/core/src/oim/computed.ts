import type { OIMSourceTracker, TOIMSlot, TOIMComputedContentSlot } from '@oimdb/core';
import { computed as computedIn } from '../oimdb/computed';
import { db } from './db';

export function computed<TValue>(
    derive: () => TValue,
    sourceSlots?: readonly (TOIMSlot & { readonly value?: never })[],
): TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> {
    return computedIn(db(), derive, sourceSlots);
}
