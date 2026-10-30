import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import { OIMSourceList } from './OIMSourceList';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { oimGetAllRootSlots } from './utils/oimGetAllRootSlots';

export class OIMSourceTracker {
    private readonly slotSourceList = new OIMSourceList<TOIMSlot>();

    private computedSourceList: OIMSourceList<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>> | undefined = undefined;

    private committedAllRootSlots: TOIMSlot[] = [];

    private trackedAllRootSlots: TOIMSlot[] = [];

    private isTrackedAllRootSlotsChanged = false;

    private committedComputedRootSlots: (readonly TOIMSlot[])[] = [];

    private trackedComputedRootSlots: (readonly TOIMSlot[])[] = [];

    public readSourceSlot<TSlot extends TOIMSlot>(slot: TSlot): TSlot {
        this.slotSourceList.trackSource(slot);
        return slot;
    }

    public readSourceComputedValue<TValue>(computedSlot: TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>): TValue {
        const value = computedSlot.computedValueService.getValueForSlot(computedSlot);
        (this.computedSourceList ??= new OIMSourceList<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>>()).trackSource(computedSlot as TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>);
        return value;
    }

    public openSourceTracking(): void {
        this.slotSourceList.openSourceTracking();
        this.computedSourceList?.openSourceTracking();
        this.isTrackedAllRootSlotsChanged = false;
    }

    public closeSourceTracking(): boolean {
        const isSourceSlotsChanged = this.slotSourceList.closeSourceTracking();
        const isSourceComputedsChanged = this.computedSourceList?.closeSourceTracking() ?? false;
        if (!isSourceSlotsChanged && !isSourceComputedsChanged && !this.isAnyComputedRootSlotsReplaced()) return false;
        this.trackAllRootSlots();
        return true;
    }

    public isAnyComputedRootSlotsReplaced(): boolean {
        const computedSourceList = this.computedSourceList;
        if (computedSourceList === undefined) return false;
        const committedSourceComputeds = computedSourceList.getCommittedSources();
        const committedComputedRootSlots = this.committedComputedRootSlots;
        for (let i = 0; i < committedSourceComputeds.length; i++) {
            if (oimGetAllRootSlots(committedSourceComputeds[i]) !== committedComputedRootSlots[i]) return true;
        }
        return false;
    }

    public trackReplacedRootSlots(): boolean {
        if (!this.isAnyComputedRootSlotsReplaced()) return false;
        this.trackAllRootSlots();
        return true;
    }

    public getTrackedSourceSlots(): readonly TOIMSlot[] {
        return this.slotSourceList.getTrackedSources();
    }

    public getTrackedSourceComputeds(): readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[] {
        return this.computedSourceList?.getTrackedSources() ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
    }

    public getTrackedAllRootSlots(): readonly TOIMSlot[] {
        return this.isTrackedAllRootSlotsChanged ? this.trackedAllRootSlots : this.committedAllRootSlots;
    }

    public commitTrackedSources(): void {
        this.slotSourceList.commitTrackedSources();
        this.computedSourceList?.commitTrackedSources();
        if (!this.isTrackedAllRootSlotsChanged) return;
        const committedAllRootSlots = this.committedAllRootSlots;
        this.committedAllRootSlots = this.trackedAllRootSlots;
        this.trackedAllRootSlots = committedAllRootSlots;
        const committedComputedRootSlots = this.committedComputedRootSlots;
        this.committedComputedRootSlots = this.trackedComputedRootSlots;
        this.trackedComputedRootSlots = committedComputedRootSlots;
        this.isTrackedAllRootSlotsChanged = false;
    }

    private trackAllRootSlots(): void {
        const sourceSlots = this.slotSourceList.getTrackedSources();
        const sourceComputeds = this.getTrackedSourceComputeds();
        const trackedAllRootSlots = this.trackedAllRootSlots;
        const trackedComputedRootSlots = this.trackedComputedRootSlots;
        if (trackedComputedRootSlots.length !== sourceComputeds.length) trackedComputedRootSlots.length = sourceComputeds.length;
        let rootSlotCount = 0;
        for (let i = 0; i < sourceSlots.length; i++) trackedAllRootSlots[rootSlotCount++] = sourceSlots[i];
        for (let i = 0; i < sourceComputeds.length; i++) {
            const computedRootSlots = oimGetAllRootSlots(sourceComputeds[i]);
            trackedComputedRootSlots[i] = computedRootSlots;
            for (let j = 0; j < computedRootSlots.length; j++) trackedAllRootSlots[rootSlotCount++] = computedRootSlots[j];
        }
        if (trackedAllRootSlots.length !== rootSlotCount) trackedAllRootSlots.length = rootSlotCount;
        this.isTrackedAllRootSlotsChanged = true;
    }
}
