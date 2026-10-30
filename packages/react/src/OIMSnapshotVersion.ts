import { OIMEffectService } from '@oimdb/core';
import type { IOIMChannelMap, TOIMComputedContentSlot, TOIMDisposer, TOIMSlot } from '@oimdb/core';

export class OIMSnapshotVersion {
    private version = 0;

    public readonly getVersion = (): number => this.version;

    public subscribeEffect(
        channelMap: IOIMChannelMap,
        onStoreChange: () => void,
        sourceSlots?: readonly TOIMSlot[],
        sourceComputeds?: readonly TOIMComputedContentSlot[],
    ): TOIMDisposer {
        this.version++;
        return OIMEffectService.INSTANCE.subscribeEffect(channelMap, () => {
            this.version++;
            onStoreChange();
        }, sourceSlots, sourceComputeds);
    }
}
