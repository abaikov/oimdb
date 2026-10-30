import type { OIMChannelQueue } from '../../channel/OIMChannelQueue';

export interface IOIMSlotContentChangeListener<TSlot, TPatch = unknown> {
    onContentChanged(slot: TSlot, patch: TPatch | undefined, changedColumns: readonly string[] | undefined): void;
    onManyContentsChanged(
        slotChannelQueue: OIMChannelQueue<TSlot>,
        patchChannelQueue: OIMChannelQueue<TPatch | undefined>,
        changedColumnsChannelQueue: OIMChannelQueue<readonly string[] | undefined>,
    ): void;
}
