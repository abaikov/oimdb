import { useMemo } from 'react';
import type { TOIMComputedContentSlot } from '@oimdb/core';
import type { TOIMBinding } from './types/TOIMBinding';
import { useOIMValue } from './useOIMValue';

export function useOIMComputedValue<TValue>(computedSlot: TOIMComputedContentSlot<TValue>): TValue {
    const binding = useMemo((): TOIMBinding<TValue> => ({
        sourceComputeds: [computedSlot],
        derive: () => computedSlot.value,
    }), [computedSlot]);
    return useOIMValue(binding);
}
