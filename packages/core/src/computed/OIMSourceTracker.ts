import type { IOIMSourceTracker } from './interfaces/IOIMSourceTracker';
import type { OIMComputedSlot } from './OIMComputedSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import { OIMSourceList } from './OIMSourceList';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { oimGetAllRootSlots } from './utils/oimGetAllRootSlots';

export class OIMSourceTracker implements IOIMSourceTracker {

    private readonly slotSourceList = new OIMSourceList<TOIMSlot>();

    private computedSourceList: OIMSourceList<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>> | undefined = undefined;

    private committedAllRootSlots: TOIMSlot[] = [];

    private trackedAllRootSlots: TOIMSlot[] = [];

    private committedAllRootColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private trackedAllRootColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private isTrackedAllRootSlotsChanged = false;

    private committedComputedRootSlots: (readonly TOIMSlot[])[] = [];

    private trackedComputedRootSlots: (readonly TOIMSlot[])[] = [];

    public readSourceSlot<TSlot extends TOIMSlot>(slot: TSlot): TSlot {
        this.slotSourceList.trackSource(slot);
        return slot;
    }

    public readSourceComputedValue<TValue>(computedSlot: TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>): TValue {
        const value = (computedSlot as unknown as OIMComputedSlot<TValue>).computedValueService.getValueForSlot(computedSlot);
        this.trackSourceComputed(computedSlot);
        return value;
    }

    public trackSourceSlot(slot: TOIMSlot, columnGroup?: TOIMColumnGroup): void {
        this.slotSourceList.trackSource(slot, columnGroup);
    }

    public trackSourceComputed(computedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>): void {
        (this.computedSourceList ??= new OIMSourceList<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>>()).trackSource(computedSlot);
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

    public getTrackedAllRootColumnGroups(): readonly (TOIMColumnGroup | undefined)[] {
        return this.isTrackedAllRootSlotsChanged ? this.trackedAllRootColumnGroups : this.committedAllRootColumnGroups;
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
        const committedAllRootColumnGroups = this.committedAllRootColumnGroups;
        this.committedAllRootColumnGroups = this.trackedAllRootColumnGroups;
        this.trackedAllRootColumnGroups = committedAllRootColumnGroups;
        const committedComputedRootSlots = this.committedComputedRootSlots;
        this.committedComputedRootSlots = this.trackedComputedRootSlots;
        this.trackedComputedRootSlots = committedComputedRootSlots;
        this.isTrackedAllRootSlotsChanged = false;
    }

    private trackAllRootSlots(): void {
        const sourceSlots = this.slotSourceList.getTrackedSources();
        const sourceSlotColumnGroups = this.slotSourceList.getTrackedColumnGroups();
        const sourceComputeds = this.getTrackedSourceComputeds();
        const trackedAllRootSlots = this.trackedAllRootSlots;
        const trackedAllRootColumnGroups = this.trackedAllRootColumnGroups;
        const trackedComputedRootSlots = this.trackedComputedRootSlots;
        if (trackedComputedRootSlots.length !== sourceComputeds.length) trackedComputedRootSlots.length = sourceComputeds.length;
        let rootSlotCount = 0;
        for (let i = 0; i < sourceSlots.length; i++) {
            trackedAllRootColumnGroups[rootSlotCount] = sourceSlotColumnGroups[i];
            trackedAllRootSlots[rootSlotCount++] = sourceSlots[i];
        }
        for (let i = 0; i < sourceComputeds.length; i++) {
            const computedRootSlots = oimGetAllRootSlots(sourceComputeds[i]);
            trackedComputedRootSlots[i] = computedRootSlots;
            for (let j = 0; j < computedRootSlots.length; j++) {
                trackedAllRootColumnGroups[rootSlotCount] = undefined;
                trackedAllRootSlots[rootSlotCount++] = computedRootSlots[j];
            }
        }
        if (trackedAllRootSlots.length !== rootSlotCount) trackedAllRootSlots.length = rootSlotCount;
        if (trackedAllRootColumnGroups.length !== rootSlotCount) trackedAllRootColumnGroups.length = rootSlotCount;
        this.isTrackedAllRootSlotsChanged = true;
    }
}
