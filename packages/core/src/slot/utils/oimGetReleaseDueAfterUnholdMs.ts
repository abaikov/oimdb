import type { TOIMSlot } from '../types/TOIMSlot';

export function oimGetReleaseDueAfterUnholdMs(slot: TOIMSlot): number {
    return slot.releaseDueAfterUnholdMs;
}
