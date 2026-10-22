import { useEffect, useRef, useState } from 'react';
import { oimSameKeySequence } from '@oimdb/core';
import type { OIMSlotCollectionService, TOIMIndexableSlot, TOIMStoreSlot } from '@oimdb/core';

export function useOIMSlotsByKeys<TKey, TSlot extends TOIMIndexableSlot<TKey>, TStore = unknown>(
    slotCollectionService: Pick<OIMSlotCollectionService<TKey, TSlot, TStore, unknown>, 'getSlotByKey' | 'holdSlotByKey'>,
    storeSlot: TOIMStoreSlot<TStore, TSlot>,
    keys: readonly TKey[],
): readonly TSlot[] {
    const settledKeys = useRef(keys);
    const previousKeys = settledKeys.current;
    if (!oimSameKeySequence(previousKeys, keys)) settledKeys.current = keys;
    const keysToHold = settledKeys.current;

    const [, resolveAgain] = useState(0);
    const resolvedSlots = useRef<readonly TSlot[] | undefined>(undefined);
    const resolvedKeys = useRef(keysToHold);
    const resolvedSlotCollectionService = useRef(slotCollectionService);
    const resolvedStoreSlot = useRef(storeSlot);
    if (resolvedSlots.current === undefined
        || resolvedKeys.current !== keysToHold
        || resolvedSlotCollectionService.current !== slotCollectionService
        || resolvedStoreSlot.current !== storeSlot) {
        const slots: TSlot[] = [];
        for (let i = 0; i < keysToHold.length; i++) {
            slots.push(slotCollectionService.getSlotByKey(storeSlot, keysToHold[i]));
        }
        resolvedSlots.current = slots;
        resolvedKeys.current = keysToHold;
        resolvedSlotCollectionService.current = slotCollectionService;
        resolvedStoreSlot.current = storeSlot;
    }
    const slots = resolvedSlots.current;

    useEffect(() => {
        const renderedSlots = resolvedSlots.current;
        const heldSlots: TSlot[] = [];
        let someKeyNamesAnotherIdentityNow = false;
        for (let i = 0; i < keysToHold.length; i++) {
            const slot = slotCollectionService.holdSlotByKey(storeSlot, keysToHold[i]);
            heldSlots.push(slot);
            if (slot !== renderedSlots?.[i]) someKeyNamesAnotherIdentityNow = true;
        }
        if (someKeyNamesAnotherIdentityNow) {
            resolvedSlots.current = undefined;
            resolveAgain(version => version + 1);
        }
        return (): void => {
            for (let i = 0; i < heldSlots.length; i++) {
                const heldSlot = heldSlots[i];
                heldSlot.owner.unholdSlot(heldSlot);
            }
        };
    }, [slotCollectionService, storeSlot, keysToHold]);

    return slots;
}
