import { OIMEffectService } from '@oimdb/core';
import type { IOIMChannelMap, TOIMComputedSlot, TOIMDisposer, TOIMSlot } from '@oimdb/core';

export class OIMSnapshotVersion {
    private version = 0;

    public readonly getVersion = (): number => this.version;

    public subscribeEffect(
        channelMap: IOIMChannelMap,
        sourceSlots: readonly TOIMSlot[],
        sourceComputeds: readonly TOIMComputedSlot[],
        onStoreChange: () => void,
    ): TOIMDisposer {
        this.version++;
        return OIMEffectService.INSTANCE.subscribeEffect(channelMap, sourceSlots, sourceComputeds, () => {
            this.version++;
            onStoreChange();
        });
    }
}
