import type { TOIMSlot } from '../types/TOIMSlot';

export function peekOIMReleaseDueAfterUnholdMs(slot: TOIMSlot): number {
    return slot.releaseDueAfterUnholdMs;
}
