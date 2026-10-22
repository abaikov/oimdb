import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import { OIMEffectSourceList } from './OIMEffectSourceList';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { oimGetAllRootSlots } from './utils/oimGetAllRootSlots';

export class OIMEffectSourceTracker {
    private readonly slotEffectSourceList = new OIMEffectSourceList<TOIMSlot>();

    private computedEffectSourceList: OIMEffectSourceList<TOIMComputedSlot> | undefined = undefined;

    private committedAllRootSlots: TOIMSlot[] = [];

    private trackedAllRootSlots: TOIMSlot[] = [];

    private isTrackedAllRootSlotsChanged = false;

    public readSourceSlot<TSlot extends TOIMSlot>(slot: TSlot): TSlot {
        this.slotEffectSourceList.trackSource(slot);
        return slot;
    }

    public readSourceComputedValue<TValue>(computedSlot: TOIMComputedSlot<TValue, unknown>): TValue {
        const value = computedSlot.computedValueService.getValueForSlot(computedSlot);
        (this.computedEffectSourceList ??= new OIMEffectSourceList<TOIMComputedSlot>()).trackSource(computedSlot);
        return value;
    }

    public openSourceTracking(): void {
        this.slotEffectSourceList.openSourceTracking();
        this.computedEffectSourceList?.openSourceTracking();
        this.isTrackedAllRootSlotsChanged = false;
    }

    public closeSourceTracking(): boolean {
        const isSourceSlotsChanged = this.slotEffectSourceList.closeSourceTracking();
        const isSourceComputedsChanged = this.computedEffectSourceList?.closeSourceTracking() ?? false;
        if (!isSourceSlotsChanged && !isSourceComputedsChanged) return false;
        this.trackAllRootSlots();
        return true;
    }

    public getTrackedSourceSlots(): readonly TOIMSlot[] {
        return this.slotEffectSourceList.getTrackedSources();
    }

    public getTrackedSourceComputeds(): readonly TOIMComputedSlot[] {
        return this.computedEffectSourceList?.getTrackedSources() ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
    }

    public getTrackedAllRootSlots(): readonly TOIMSlot[] {
        return this.isTrackedAllRootSlotsChanged ? this.trackedAllRootSlots : this.committedAllRootSlots;
    }

    public commitTrackedSources(): void {
        this.slotEffectSourceList.commitTrackedSources();
        this.computedEffectSourceList?.commitTrackedSources();
        if (!this.isTrackedAllRootSlotsChanged) return;
        const committedAllRootSlots = this.committedAllRootSlots;
        this.committedAllRootSlots = this.trackedAllRootSlots;
        this.trackedAllRootSlots = committedAllRootSlots;
        this.isTrackedAllRootSlotsChanged = false;
    }

    private trackAllRootSlots(): void {
        const sourceSlots = this.slotEffectSourceList.getTrackedSources();
        const sourceComputeds = this.getTrackedSourceComputeds();
        const trackedAllRootSlots = this.trackedAllRootSlots;
        let rootSlotCount = 0;
        for (let i = 0; i < sourceSlots.length; i++) trackedAllRootSlots[rootSlotCount++] = sourceSlots[i];
        for (let i = 0; i < sourceComputeds.length; i++) {
            const computedRootSlots = oimGetAllRootSlots(sourceComputeds[i]);
            for (let j = 0; j < computedRootSlots.length; j++) trackedAllRootSlots[rootSlotCount++] = computedRootSlots[j];
        }
        if (trackedAllRootSlots.length !== rootSlotCount) trackedAllRootSlots.length = rootSlotCount;
        this.isTrackedAllRootSlotsChanged = true;
    }
}
