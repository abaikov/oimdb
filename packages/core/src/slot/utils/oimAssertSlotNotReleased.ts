import type { TOIMSlot } from '../types/TOIMSlot';
import { OIM_SLOT_FLAG_RELEASED } from '../constants/OIM_SLOT_FLAG_RELEASED';

export const oimAssertSlotNotReleased = (slot: TOIMSlot): void => {
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) === 0) return;
    throw new Error(
        'This identity was released: nothing held it and nothing kept it, so the engine let it go '
        + 'and it is no longer filed under any key. Anything landing on it now would reach an '
        + 'object no lookup can return and no release door will ever take out again. Resolve the '
        + 'key afresh.',
    );
};
