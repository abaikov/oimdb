import type { IOIMSourceTracker } from './interfaces/IOIMSourceTracker';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { TOIMComputedContentSlot } from './types/TOIMComputedContentSlot';
import { OIMSourceList } from './OIMSourceList';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from './constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { getOIMRootSlots } from './utils/getOIMRootSlots';
import { swapOIMActiveSourceTracker } from './utils/swapOIMActiveSourceTracker';

export class OIMSourceTracker implements IOIMSourceTracker {

    private readonly slotSourceList = new OIMSourceList<TOIMSlot>();

    private computedSourceList: OIMSourceList<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>> | undefined = undefined;

    private committedRootSlots: TOIMSlot[] = [];

    private trackedRootSlots: TOIMSlot[] = [];

    private committedRootColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private trackedRootColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private isTrackedRootSlotsChanged = false;

    private committedComputedRootSlots: (readonly TOIMSlot[])[] = [];

    private trackedComputedRootSlots: (readonly TOIMSlot[])[] = [];

    public trackSourceSlot(slot: TOIMSlot, columnGroup?: TOIMColumnGroup): void {
        this.slotSourceList.trackSource(slot, columnGroup);
    }

    public trackSourceComputed(computedSlot: TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>): void {
        (this.computedSourceList ??= new OIMSourceList<TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>>()).trackSource(computedSlot);
    }

    public runSourceTracking<TValue>(read: () => TValue): TValue {
        this.openSourceTracking();
        const outerSourceTracker = swapOIMActiveSourceTracker(this);
        try {
            return read();
        } finally {
            swapOIMActiveSourceTracker(outerSourceTracker);
            this.closeSourceTracking();
        }
    }

    public openSourceTracking(): void {
        this.slotSourceList.openSourceTracking();
        this.computedSourceList?.openSourceTracking();
        this.isTrackedRootSlotsChanged = false;
    }

    public closeSourceTracking(): boolean {
        const isSourceSlotsChanged = this.slotSourceList.closeSourceTracking();
        const isSourceComputedsChanged = this.computedSourceList?.closeSourceTracking() ?? false;
        if (!isSourceSlotsChanged && !isSourceComputedsChanged && !this.isAnyComputedRootSlotsReplaced()) return false;
        this.trackRootSlots();
        return true;
    }

    public isAnyComputedRootSlotsReplaced(): boolean {
        const computedSourceList = this.computedSourceList;
        if (computedSourceList === undefined) return false;
        const committedSourceComputeds = computedSourceList.getCommittedSources();
        const committedComputedRootSlots = this.committedComputedRootSlots;
        for (let i = 0; i < committedSourceComputeds.length; i++) {
            if (getOIMRootSlots(committedSourceComputeds[i]) !== committedComputedRootSlots[i]) return true;
        }
        return false;
    }

    public trackReplacedRootSlots(): boolean {
        if (!this.isAnyComputedRootSlotsReplaced()) return false;
        this.trackRootSlots();
        return true;
    }

    public getTrackedSourceSlots(): readonly TOIMSlot[] {
        return this.slotSourceList.getTrackedSources();
    }

    public getTrackedSourceColumnGroups(): readonly (TOIMColumnGroup | undefined)[] {
        return this.slotSourceList.getTrackedColumnGroups();
    }

    public getTrackedRootColumnGroups():readonly (TOIMColumnGroup | undefined)[] {
        return this.isTrackedRootSlotsChanged ? this.trackedRootColumnGroups : this.committedRootColumnGroups;
    }

    public getTrackedSourceComputeds(): readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[] {
        return this.computedSourceList?.getTrackedSources() ?? OIM_FROZEN_EMPTY_COMPUTED_SLOTS;
    }

    public getTrackedRootSlots(): readonly TOIMSlot[] {
        return this.isTrackedRootSlotsChanged ? this.trackedRootSlots : this.committedRootSlots;
    }

    public commitTrackedSources(): void {
        this.slotSourceList.commitTrackedSources();
        this.computedSourceList?.commitTrackedSources();
        if (!this.isTrackedRootSlotsChanged) return;
        const committedRootSlots = this.committedRootSlots;
        this.committedRootSlots = this.trackedRootSlots;
        this.trackedRootSlots = committedRootSlots;
        const committedRootColumnGroups = this.committedRootColumnGroups;
        this.committedRootColumnGroups = this.trackedRootColumnGroups;
        this.trackedRootColumnGroups = committedRootColumnGroups;
        const committedComputedRootSlots = this.committedComputedRootSlots;
        this.committedComputedRootSlots = this.trackedComputedRootSlots;
        this.trackedComputedRootSlots = committedComputedRootSlots;
        this.isTrackedRootSlotsChanged = false;
    }

    private trackRootSlots(): void {
        const sourceSlots = this.slotSourceList.getTrackedSources();
        const sourceSlotColumnGroups = this.slotSourceList.getTrackedColumnGroups();
        const sourceComputeds = this.getTrackedSourceComputeds();
        const trackedRootSlots = this.trackedRootSlots;
        const trackedRootColumnGroups = this.trackedRootColumnGroups;
        const trackedComputedRootSlots = this.trackedComputedRootSlots;
        if (trackedComputedRootSlots.length !== sourceComputeds.length) trackedComputedRootSlots.length = sourceComputeds.length;
        let rootSlotCount = 0;
        for (let i = 0; i < sourceSlots.length; i++) {
            trackedRootColumnGroups[rootSlotCount] = sourceSlotColumnGroups[i];
            trackedRootSlots[rootSlotCount++] = sourceSlots[i];
        }
        for (let i = 0; i < sourceComputeds.length; i++) {
            const computedRootSlots = getOIMRootSlots(sourceComputeds[i]);
            trackedComputedRootSlots[i] = computedRootSlots;
            for (let j = 0; j < computedRootSlots.length; j++) {
                trackedRootColumnGroups[rootSlotCount] = undefined;
                trackedRootSlots[rootSlotCount++] = computedRootSlots[j];
            }
        }
        if (trackedRootSlots.length !== rootSlotCount) trackedRootSlots.length = rootSlotCount;
        if (trackedRootColumnGroups.length !== rootSlotCount) trackedRootColumnGroups.length = rootSlotCount;
        this.isTrackedRootSlotsChanged = true;
    }
}
