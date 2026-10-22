import type { TOIMSlot } from '../slot/types/TOIMSlot';

export class OIMEffectSourceList<TSource extends TOIMSlot> {
    private committedSources: TSource[] = [];

    private trackedSources: TSource[] = [];

    private trackedSourceCount = 0;

    private isTrackedSourcesDiverged = false;

    private isTrackedSourcesChanged = false;

    public openSourceTracking(): void {
        this.trackedSourceCount = 0;
        this.isTrackedSourcesDiverged = false;
        this.isTrackedSourcesChanged = false;
    }

    public trackSource(source: TSource): void {
        const trackedSourceCount = this.trackedSourceCount;
        const committedSources = this.committedSources;
        if (
            !this.isTrackedSourcesDiverged && trackedSourceCount < committedSources.length
            && committedSources[trackedSourceCount] === source
        ) {
            this.trackedSourceCount = trackedSourceCount + 1;
            return;
        }
        this.trackSourceOffCommittedOrder(source, trackedSourceCount);
    }

    private trackSourceOffCommittedOrder(source: TSource, trackedSourceCount: number): void {
        const trackedSources = this.trackedSources;
        if (this.isTrackedSourcesDiverged) {
            if (this.hasSourceAmongFirst(trackedSources, trackedSourceCount, source)) return;
            trackedSources[trackedSourceCount] = source;
            this.trackedSourceCount = trackedSourceCount + 1;
            return;
        }
        const committedSources = this.committedSources;
        if (this.hasSourceAmongFirst(committedSources, trackedSourceCount, source)) return;
        for (let i = 0; i < trackedSourceCount; i++) trackedSources[i] = committedSources[i];
        trackedSources[trackedSourceCount] = source;
        this.trackedSourceCount = trackedSourceCount + 1;
        this.isTrackedSourcesDiverged = true;
    }

    public closeSourceTracking(): boolean {
        const trackedSourceCount = this.trackedSourceCount;
        const trackedSources = this.trackedSources;
        if (!this.isTrackedSourcesDiverged) {
            const committedSources = this.committedSources;
            if (trackedSourceCount === committedSources.length) return false;
            for (let i = 0; i < trackedSourceCount; i++) trackedSources[i] = committedSources[i];
        }
        if (trackedSources.length !== trackedSourceCount) trackedSources.length = trackedSourceCount;
        this.isTrackedSourcesChanged = true;
        return true;
    }

    public getTrackedSources(): readonly TSource[] {
        return this.isTrackedSourcesChanged ? this.trackedSources : this.committedSources;
    }

    public commitTrackedSources(): void {
        if (!this.isTrackedSourcesChanged) return;
        const committedSources = this.committedSources;
        this.committedSources = this.trackedSources;
        this.trackedSources = committedSources;
        this.isTrackedSourcesChanged = false;
    }

    private hasSourceAmongFirst(sources: readonly TSource[], sourceCount: number, source: TSource): boolean {
        for (let i = 0; i < sourceCount; i++) {
            if (sources[i] === source) return true;
        }
        return false;
    }
}
