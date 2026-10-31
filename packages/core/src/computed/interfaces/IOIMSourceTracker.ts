import type { OIMSourceTracker } from '../OIMSourceTracker';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../../column/types/TOIMColumnGroup';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';

export interface IOIMSourceTracker {
    trackSourceSlot(slot: TOIMSlot, columnGroup?: TOIMColumnGroup): void;
    trackSourceComputed(computedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>): void;
}
