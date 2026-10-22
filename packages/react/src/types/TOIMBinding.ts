import type { TOIMComputedSlot, TOIMSlot } from '@oimdb/core';

export type TOIMBinding<TValue> = {
    readonly sourceSlots?: readonly TOIMSlot[] | undefined;
    readonly sourceComputeds?: readonly TOIMComputedSlot[] | undefined;
    readonly derive: () => TValue;
};
