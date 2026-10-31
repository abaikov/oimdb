import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';

export class OIMSourceList<TSource extends TOIMSlot> {
    private committedSources: TSource[] = [];

    private trackedSources: TSource[] = [];

    private committedColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private trackedColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private trackedSourceCount = 0;

    private isTrackedSourcesDiverged = false;

    private isTrackedSourcesChanged = false;

    public openSourceTracking(): void {
        this.trackedSourceCount = 0;
        this.isTrackedSourcesDiverged = false;
        this.isTrackedSourcesChanged = false;
    }

    public trackSource(source: TSource, columnGroup?: TOIMColumnGroup): void {
        const trackedSourceCount = this.trackedSourceCount;
        const committedSources = this.committedSources;
        if (
            !this.isTrackedSourcesDiverged && trackedSourceCount < committedSources.length
            && committedSources[trackedSourceCount] === source && this.committedColumnGroups[trackedSourceCount] === columnGroup
        ) {
            this.trackedSourceCount = trackedSourceCount + 1;
            return;
        }
        this.trackSourceOffCommittedOrder(source, columnGroup, trackedSourceCount);
    }

    private trackSourceOffCommittedOrder(source: TSource, columnGroup: TOIMColumnGroup | undefined, trackedSourceCount: number): void {
        const trackedSources = this.trackedSources;
        const trackedColumnGroups = this.trackedColumnGroups;
        if (this.isTrackedSourcesDiverged) {
            if (this.hasSourceAmongFirst(trackedSources, trackedColumnGroups, trackedSourceCount, source, columnGroup)) return;
            trackedSources[trackedSourceCount] = source;
            trackedColumnGroups[trackedSourceCount] = columnGroup;
            this.trackedSourceCount = trackedSourceCount + 1;
            return;
        }
        const committedSources = this.committedSources;
        const committedColumnGroups = this.committedColumnGroups;
        if (this.hasSourceAmongFirst(committedSources, committedColumnGroups, trackedSourceCount, source, columnGroup)) return;
        for (let i = 0; i < trackedSourceCount; i++) {
            trackedSources[i] = committedSources[i];
            trackedColumnGroups[i] = committedColumnGroups[i];
        }
        trackedSources[trackedSourceCount] = source;
        trackedColumnGroups[trackedSourceCount] = columnGroup;
        this.trackedSourceCount = trackedSourceCount + 1;
        this.isTrackedSourcesDiverged = true;
    }

    public closeSourceTracking(): boolean {
        const trackedSourceCount = this.trackedSourceCount;
        const trackedSources = this.trackedSources;
        const trackedColumnGroups = this.trackedColumnGroups;
        if (!this.isTrackedSourcesDiverged) {
            const committedSources = this.committedSources;
            if (trackedSourceCount === committedSources.length) return false;
            const committedColumnGroups = this.committedColumnGroups;
            for (let i = 0; i < trackedSourceCount; i++) {
                trackedSources[i] = committedSources[i];
                trackedColumnGroups[i] = committedColumnGroups[i];
            }
        }
        if (trackedSources.length !== trackedSourceCount) trackedSources.length = trackedSourceCount;
        if (trackedColumnGroups.length !== trackedSourceCount) trackedColumnGroups.length = trackedSourceCount;
        this.isTrackedSourcesChanged = true;
        return true;
    }

    public getCommittedSources(): readonly TSource[] {
        return this.committedSources;
    }

    public getTrackedSources(): readonly TSource[] {
        return this.isTrackedSourcesChanged ? this.trackedSources : this.committedSources;
    }

    public getTrackedColumnGroups(): readonly (TOIMColumnGroup | undefined)[] {
        return this.isTrackedSourcesChanged ? this.trackedColumnGroups : this.committedColumnGroups;
    }

    public commitTrackedSources(): void {
        if (!this.isTrackedSourcesChanged) return;
        const committedSources = this.committedSources;
        this.committedSources = this.trackedSources;
        this.trackedSources = committedSources;
        const committedColumnGroups = this.committedColumnGroups;
        this.committedColumnGroups = this.trackedColumnGroups;
        this.trackedColumnGroups = committedColumnGroups;
        this.isTrackedSourcesChanged = false;
    }

    private hasSourceAmongFirst(
        sources: readonly TSource[], columnGroups: readonly (TOIMColumnGroup | undefined)[], sourceCount: number,
        source: TSource, columnGroup: TOIMColumnGroup | undefined,
    ): boolean {
        for (let i = 0; i < sourceCount; i++) {
            if (sources[i] === source && columnGroups[i] === columnGroup) return true;
        }
        return false;
    }
}
