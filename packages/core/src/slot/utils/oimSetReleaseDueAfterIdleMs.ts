import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEditable } from '../types/TOIMEditable';

export function oimSetReleaseDueAfterIdleMs(slot: TOIMSlot, releaseDueMs: number): void {
    (slot as TOIMEditable<TOIMSlot>).releaseDueAfterIdleMs = releaseDueMs;
}
