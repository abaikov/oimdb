import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';

const scannedSourceLimit = 16;

export class OIMSourceList<TSource extends TOIMSlot> {
    private committedSources: TSource[] = [];

    private trackedSources: TSource[] = [];

    private committedColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private trackedColumnGroups: (TOIMColumnGroup | undefined)[] = [];

    private trackedSourceCount = 0;

    private isTrackedSourcesDiverged = false;

    private isTrackedSourcesChanged = false;

    private trackedColumnGroupsBySource: Map<TSource, (TOIMColumnGroup | undefined)[]> | undefined = undefined;

    private committedPositionsBySource: Map<TSource, number[]> | undefined = undefined;

    public openSourceTracking(): void {
        this.trackedColumnGroupsBySource = undefined;
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
            if (this.isSourceTracked(trackedSources, trackedColumnGroups, trackedSourceCount, source, columnGroup)) return;
            trackedSources[trackedSourceCount] = source;
            trackedColumnGroups[trackedSourceCount] = columnGroup;
            this.trackedSourceCount = trackedSourceCount + 1;
            this.rememberTrackedSource(source, columnGroup);
            return;
        }
        const committedSources = this.committedSources;
        const committedColumnGroups = this.committedColumnGroups;
        if (this.isCommittedSourceAmongFirst(trackedSourceCount, source, columnGroup)) return;
        for (let i = 0; i < trackedSourceCount; i++) {
            trackedSources[i] = committedSources[i];
            trackedColumnGroups[i] = committedColumnGroups[i];
        }
        trackedSources[trackedSourceCount] = source;
        trackedColumnGroups[trackedSourceCount] = columnGroup;
        this.trackedSourceCount = trackedSourceCount + 1;
        this.isTrackedSourcesDiverged = true;
        this.rememberTrackedSource(source, columnGroup);
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
        this.committedPositionsBySource = undefined;
        this.isTrackedSourcesChanged = false;
    }

    private isCommittedSourceAmongFirst(sourceCount: number, source: TSource, columnGroup: TOIMColumnGroup | undefined): boolean {
        const committedSources = this.committedSources;
        const committedColumnGroups = this.committedColumnGroups;
        if (committedSources.length <= scannedSourceLimit) {
            return this.hasSourceAmongFirst(committedSources, committedColumnGroups, sourceCount, source, columnGroup);
        }
        let committedPositionsBySource = this.committedPositionsBySource;
        if (committedPositionsBySource === undefined) {
            committedPositionsBySource = new Map<TSource, number[]>();
            for (let i = 0; i < committedSources.length; i++) {
                const positions = committedPositionsBySource.get(committedSources[i]);
                if (positions === undefined) committedPositionsBySource.set(committedSources[i], [i]);
                else positions.push(i);
            }
            this.committedPositionsBySource = committedPositionsBySource;
        }
        const positions = committedPositionsBySource.get(source);
        if (positions === undefined) return false;
        for (let i = 0; i < positions.length; i++) {
            const position = positions[i];
            if (position < sourceCount && committedColumnGroups[position] === columnGroup) return true;
        }
        return false;
    }

    private isSourceTracked(
        trackedSources: readonly TSource[], trackedColumnGroups: readonly (TOIMColumnGroup | undefined)[], trackedSourceCount: number,
        source: TSource, columnGroup: TOIMColumnGroup | undefined,
    ): boolean {
        const trackedColumnGroupsBySource = this.trackedColumnGroupsBySource;
        if (trackedColumnGroupsBySource === undefined) {
            return this.hasSourceAmongFirst(trackedSources, trackedColumnGroups, trackedSourceCount, source, columnGroup);
        }
        const sourceColumnGroups = trackedColumnGroupsBySource.get(source);
        return sourceColumnGroups !== undefined && sourceColumnGroups.indexOf(columnGroup) !== -1;
    }

    private rememberTrackedSource(source: TSource, columnGroup: TOIMColumnGroup | undefined): void {
        const trackedColumnGroupsBySource = this.trackedColumnGroupsBySource;
        if (trackedColumnGroupsBySource !== undefined) {
            const sourceColumnGroups = trackedColumnGroupsBySource.get(source);
            if (sourceColumnGroups === undefined) trackedColumnGroupsBySource.set(source, [columnGroup]);
            else sourceColumnGroups.push(columnGroup);
            return;
        }
        const trackedSourceCount = this.trackedSourceCount;
        if (trackedSourceCount <= scannedSourceLimit) return;
        const createdColumnGroupsBySource = new Map<TSource, (TOIMColumnGroup | undefined)[]>();
        const trackedSources = this.trackedSources;
        const trackedColumnGroups = this.trackedColumnGroups;
        for (let i = 0; i < trackedSourceCount; i++) {
            const sourceColumnGroups = createdColumnGroupsBySource.get(trackedSources[i]);
            if (sourceColumnGroups === undefined) createdColumnGroupsBySource.set(trackedSources[i], [trackedColumnGroups[i]]);
            else sourceColumnGroups.push(trackedColumnGroups[i]);
        }
        this.trackedColumnGroupsBySource = createdColumnGroupsBySource;
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
