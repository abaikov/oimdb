import type { TOIMComputedContentSlot, TOIMSlot } from '@oimdb/core';

export type TOIMBinding<TValue> = {
    readonly sourceSlots?: readonly TOIMSlot[] | undefined;
    readonly sourceComputeds?: readonly TOIMComputedContentSlot[] | undefined;
    readonly derive: () => TValue;
};
