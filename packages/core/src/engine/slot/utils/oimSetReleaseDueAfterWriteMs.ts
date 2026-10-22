import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMSlotEditable } from '../types/TOIMSlotEditable';

export function oimSetReleaseDueAfterWriteMs(slot: TOIMSlot, releaseDueMs: number): void {
    (slot as TOIMSlotEditable<TOIMSlot>).releaseDueAfterWriteMs = releaseDueMs;
}
