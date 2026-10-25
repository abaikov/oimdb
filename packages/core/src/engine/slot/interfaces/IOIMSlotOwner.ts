import type { TOIMEffect } from '../../computed/types/TOIMEffect';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMSlotEditable } from '../types/TOIMSlotEditable';

export interface IOIMSlotOwner {
    holdSlot(slot: TOIMSlot): void;
    unholdSlot(slot: TOIMSlot): void;
    releaseSlotIfUnheld(slot: TOIMSlot): void;
    unsafeMutateSlot(slot: TOIMSlot, mutateSlot: (slotEditable: TOIMSlotEditable<TOIMSlot>) => void): void;
    subscribeToSlot(slot: TOIMSlot, effect: TOIMEffect, edge: number): number;
    unsubscribeFromSlot(slot: TOIMSlot, positionInSlot: number, effect: TOIMEffect): boolean;
    onSlotFirstSubscribed(slot: TOIMSlot): void;
    onSlotLastUnsubscribed(slot: TOIMSlot): void;
}
