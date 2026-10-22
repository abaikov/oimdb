import type { IOIMChannelMap, TOIMStoreSlot } from '@oimdb/core';

export function oimAssertOneChannel(channelMap: IOIMChannelMap, storeSlot: TOIMStoreSlot, door: string): void {
    if (storeSlot.channelSlot === channelMap.defaultChannelSlot) return;
    throw new Error(
        `${door}: the store slot was built on another OIMDB than the channel map the source was given, so a change `
            + 'to it would never wake the source and a change mark would compare against the wrong clock. Build the '
            + 'services, their store slots and the source on one OIMDB.',
    );
}
