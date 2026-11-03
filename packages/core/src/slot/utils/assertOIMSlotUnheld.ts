import type { TOIMSlot } from '../types/TOIMSlot';

export const assertOIMSlotUnheld = (slot: TOIMSlot): void => {
    if (slot.holdCount === 0) return;
    throw new Error(
        'releaseSlotContent: this slot is still held, so its identity is not going. The slot owner calls '
        + 'releaseSlotContent when it releases a slot nothing holds; to empty a held slot, use clearSlotContent.',
    );
};
