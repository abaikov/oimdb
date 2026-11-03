import { holdOIMSlots, unholdOIMSlotsIfAlive, type TOIMDisposer, type TOIMSlot } from '@oimdb/core';

/**
 * Subscribe with those identities held, giving the holds back AFTER the subscription is
 * torn down: `dispose` gives back its own reference, which unfiles an identity nothing else
 * holds at that instant.
 */
export function holdWhileSubscribed(
    slots: readonly TOIMSlot[],
    subscribe: () => TOIMDisposer,
): TOIMDisposer {
    holdOIMSlots(slots);
    const giveEveryHoldBack = (): void => { unholdOIMSlotsIfAlive(slots); };
    let disposer: TOIMDisposer;
    try {
        disposer = subscribe();
    } catch (failure) {
        giveEveryHoldBack();
        throw failure;
    }
    return (): void => {
        try {
            disposer();
        } finally {
            giveEveryHoldBack();
        }
    };
}
