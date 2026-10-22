import type { TOIMEffect } from '../../computed/types/TOIMEffect';
import type { TOIMSlot } from '../types/TOIMSlot';

export interface IOIMSlotOwner {
    holdSlot(slot: TOIMSlot): void;
    unholdSlot(slot: TOIMSlot): void;
    releaseSlotIfUnheld(slot: TOIMSlot): void;
    subscribeToSlot(slot: TOIMSlot, effect: TOIMEffect, edge: number): number;
    unsubscribeFromSlot(slot: TOIMSlot, positionInSlot: number, effect: TOIMEffect): boolean;
}
