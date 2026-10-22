import type { TOIMChannelClock, TOIMSlot } from '@oimdb/core';

export type TOIMPersistSourceChangeMarkSlotDrivenOptions = {
    readonly channelClock: TOIMChannelClock;
    readonly slots: Iterable<TOIMSlot>;
};
