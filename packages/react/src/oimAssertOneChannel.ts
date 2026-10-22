import type { IOIMChannelMap, TOIMSlot } from '@oimdb/core';

export function oimAssertOneChannel(channelMap: IOIMChannelMap, slot: TOIMSlot, door: string): void {
    const storeSlot = slot.storeSlot;
    if (storeSlot === undefined || storeSlot.channelSlot === channelMap.defaultChannelSlot) return;
    throw new Error(
        `${door}: the slot was filed on another OIMDB than the one <OIMDBProvider> was given, so a write would ` +
            'never wake this component. Build the services and their store slots on the one OIMDB the provider holds.',
    );
}
