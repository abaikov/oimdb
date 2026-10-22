import { useMemo } from 'react';
import type { TOIMComputedSlot } from '@oimdb/core';
import type { TOIMBinding } from './types/TOIMBinding';
import { useOIMValue } from './useOIMValue';

export function useOIMComputedValue<TValue>(computedSlot: TOIMComputedSlot<TValue>): TValue {
    const binding = useMemo((): TOIMBinding<TValue> => ({
        sourceComputeds: [computedSlot],
        derive: () => computedSlot.value,
    }), [computedSlot]);
    return useOIMValue(binding);
}
