import { OIMEffectService, OIMSourceTracker, isOIMAnySlotChangedAfter, isOIMSlotReleased } from '@oimdb/core';
import type { OIMDB, TOIMDisposer, TOIMEffect, TOIMSlot } from '@oimdb/core';
import type { TOIMSelectorRender } from './TOIMSelectorRender';
import type { TOIMTrackedSelectorRender } from './TOIMTrackedSelectorRender';
import { assertOIMOneChannel } from './assertOIMOneChannel';

export class OIMSelectorSubscription<TDB extends OIMDB> {
    private version = 0;

    private effect: TOIMEffect | undefined = undefined;

    private onStoreChange: (() => void) | undefined = undefined;

    private readonly renderSourceTracker = new OIMSourceTracker();

    private lastTrackedSelectorRender: TOIMTrackedSelectorRender<TDB> | undefined = undefined;

    private committedTrackedSelectorRender: TOIMTrackedSelectorRender<TDB> | undefined = undefined;

    private trackedAtRevision = 0;

    private trackedAtEpoch = 0;

    private trackedAtUnheldSlotWriteCount = 0;

    private lastTrackedSelect: ((db: TDB) => unknown) | undefined = undefined;

    private committedRootSlots: readonly TOIMSlot[] = [];

    private releasedSlots: readonly TOIMSlot[] | undefined = undefined;

    private isLastReleasedSlotsRetryFailed = false;

    private isNotifyOwed = false;

    private committedSourcesRanAtRevision = 0;

    private committedSourcesRanAtEpoch = 0;

    private committedSourceChangeCount = 0;

    public constructor(private readonly db: TDB) {}

    public readonly getVersion = (): number => this.version;

    public readonly subscribe = (onStoreChange: () => void): TOIMDisposer => {
        const effect = OIMEffectService.INSTANCE.createEffectOverSourceTracker(this.db, new OIMSourceTracker(), this.notify);
        this.effect = effect;
        this.onStoreChange = onStoreChange;
        const committedTrackedSelectorRender = this.committedTrackedSelectorRender;
        if (committedTrackedSelectorRender !== undefined && this.subscribeEffectToCommittedSources(effect, committedTrackedSelectorRender)) this.version++;
        return () => {
            this.effect = undefined;
            this.onStoreChange = undefined;
            OIMEffectService.INSTANCE.disposeEffect(effect);
        };
    };

    public getCommittedSourceChangeCount(): number {
        if (this.effect === undefined) return this.committedSourceChangeCount;
        if (isOIMAnySlotChangedAfter(this.committedRootSlots, this.committedSourcesRanAtRevision, this.committedSourcesRanAtEpoch)) {
            const clock = this.db.clock;
            this.committedSourcesRanAtRevision = clock.revision;
            this.committedSourcesRanAtEpoch = clock.epoch;
            this.committedSourceChangeCount++;
        }
        return this.committedSourceChangeCount;
    }

    public isLastTrackedSelect(select: (db: TDB) => unknown): boolean {
        return this.lastTrackedSelect === select;
    }

    public renderSelector<TValue>(select: (db: TDB) => TValue): TOIMSelectorRender<TValue, TDB> {
        const value = this.trackSelector(select);
        const trackedSelectorRender = this.renderSourceTracker.isTrackedSourcesChanged()
            ? {
                select,
                trackedAtRevision: this.trackedAtRevision,
                trackedAtEpoch: this.trackedAtEpoch,
                trackedAtUnheldSlotWriteCount: this.trackedAtUnheldSlotWriteCount,
            }
            : this.committedTrackedSelectorRender;
        if (trackedSelectorRender !== undefined && trackedSelectorRender === this.committedTrackedSelectorRender) this.rememberCommittedSourcesRun();
        this.lastTrackedSelectorRender = trackedSelectorRender;
        return { value, trackedSelectorRender };
    }

    public commitRender(trackedSelectorRender: TOIMTrackedSelectorRender<TDB> | undefined): void {
        if (trackedSelectorRender === undefined || trackedSelectorRender === this.committedTrackedSelectorRender) return;
        const effect = this.effect;
        if (effect === undefined) {
            if (this.trackCommittedSelectorIfOverwritten(trackedSelectorRender)) this.version++;
            this.commitTrackedSources(trackedSelectorRender);
            return;
        }
        if (this.subscribeEffectToCommittedSources(effect, trackedSelectorRender)) this.isNotifyOwed = true;
    }

    public notifyIfOwed(): void {
        if (!this.isNotifyOwed) return;
        this.isNotifyOwed = false;
        this.notify();
    }

    private readonly notify = (): void => {
        this.version++;
        this.onStoreChange?.();
    };

    private trackSelector<TValue>(select: (db: TDB) => TValue): TValue {
        const db = this.db;
        const clock = db.clock;
        this.trackedAtRevision = clock.revision;
        this.trackedAtEpoch = clock.epoch;
        this.trackedAtUnheldSlotWriteCount = clock.unheldSlotWriteCount;
        this.lastTrackedSelectorRender = undefined;
        this.lastTrackedSelect = select;
        return this.renderSourceTracker.runSourceTracking(() => select(db));
    }

    private trackCommittedSelectorIfOverwritten(trackedSelectorRender: TOIMTrackedSelectorRender<TDB>): boolean {
        if (this.lastTrackedSelectorRender === trackedSelectorRender) return false;
        this.trackSelectorAgain(trackedSelectorRender);
        return true;
    }

    private trackSelectorAgain(trackedSelectorRender: TOIMTrackedSelectorRender<TDB>): void {
        this.trackSelector(trackedSelectorRender.select);
        this.lastTrackedSelectorRender = trackedSelectorRender;
    }

    private subscribeEffectToCommittedSources(effect: TOIMEffect, trackedSelectorRender: TOIMTrackedSelectorRender<TDB>): boolean {
        const isTrackedAgain = this.trackCommittedSelectorIfOverwritten(trackedSelectorRender);
        const renderSourceTracker = this.renderSourceTracker;
        let releasedSlots = this.collectReleasedSlots(renderSourceTracker);
        const newlyReleasedSlots = releasedSlots === undefined ? undefined : this.collectNewlyReleasedSlots(releasedSlots);
        let isRenderAskedForReleasedSlots = false;
        if (newlyReleasedSlots === undefined) {
            this.isLastReleasedSlotsRetryFailed = false;
        } else {
            const isRecovered = this.isRecoveredByRetry(trackedSelectorRender, newlyReleasedSlots);
            if (isRecovered) {
                this.trackSelectorAgain(trackedSelectorRender);
                releasedSlots = this.collectReleasedSlots(renderSourceTracker);
            }
            isRenderAskedForReleasedSlots = isRecovered || !this.isLastReleasedSlotsRetryFailed;
            this.isLastReleasedSlotsRetryFailed = !isRecovered;
        }
        this.releasedSlots = releasedSlots;
        OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(
            effect,
            releasedSlots === undefined ? renderSourceTracker : this.trackUnreleasedSources(),
        );
        this.commitTrackedSources(trackedSelectorRender);
        return isTrackedAgain || isRenderAskedForReleasedSlots || this.isWrittenSinceTracked(trackedSelectorRender);
    }

    private isRecoveredByRetry(trackedSelectorRender: TOIMTrackedSelectorRender<TDB>, newlyReleasedSlots: readonly TOIMSlot[]): boolean {
        const retrySourceTracker = new OIMSourceTracker();
        const db = this.db;
        try {
            retrySourceTracker.runSourceTracking(() => trackedSelectorRender.select(db));
        } catch {
            return false;
        }
        const retryReleasedSlots = this.collectReleasedSlots(retrySourceTracker);
        return retryReleasedSlots === undefined || !newlyReleasedSlots.some(releasedSlot => retryReleasedSlots.includes(releasedSlot));
    }

    private commitTrackedSources(trackedSelectorRender: TOIMTrackedSelectorRender<TDB>): void {
        const renderSourceTracker = this.renderSourceTracker;
        renderSourceTracker.commitTrackedSources();
        this.committedTrackedSelectorRender = trackedSelectorRender;
        this.committedRootSlots = renderSourceTracker.getTrackedRootSlots();
        this.rememberCommittedSourcesRun();
    }

    private rememberCommittedSourcesRun(): void {
        this.committedSourcesRanAtRevision = this.trackedAtRevision;
        this.committedSourcesRanAtEpoch = this.trackedAtEpoch;
    }

    private isWrittenSinceTracked(trackedSelectorRender: TOIMTrackedSelectorRender<TDB>): boolean {
        return this.db.clock.unheldSlotWriteCount !== trackedSelectorRender.trackedAtUnheldSlotWriteCount
            || isOIMAnySlotChangedAfter(this.committedRootSlots, trackedSelectorRender.trackedAtRevision, trackedSelectorRender.trackedAtEpoch);
    }

    private collectReleasedSlots(sourceTracker: OIMSourceTracker): TOIMSlot[] | undefined {
        let releasedSlots: TOIMSlot[] | undefined = undefined;
        const rootSlots = sourceTracker.getTrackedRootSlots();
        for (let i = 0; i < rootSlots.length; i++) {
            const rootSlot = rootSlots[i];
            if (isOIMSlotReleased(rootSlot)) (releasedSlots ??= []).push(rootSlot);
            else assertOIMOneChannel(this.db, rootSlot, 'useOIMSelector');
        }
        const sourceComputeds = sourceTracker.getTrackedSourceComputeds();
        for (let i = 0; i < sourceComputeds.length; i++) {
            const sourceComputed = sourceComputeds[i];
            if (isOIMSlotReleased(sourceComputed)) (releasedSlots ??= []).push(sourceComputed);
        }
        return releasedSlots;
    }

    private collectNewlyReleasedSlots(releasedSlots: readonly TOIMSlot[]): TOIMSlot[] | undefined {
        const lastReleasedSlots = this.releasedSlots;
        let newlyReleasedSlots: TOIMSlot[] | undefined = undefined;
        for (let i = 0; i < releasedSlots.length; i++) {
            const releasedSlot = releasedSlots[i];
            if (lastReleasedSlots === undefined || !lastReleasedSlots.includes(releasedSlot)) (newlyReleasedSlots ??= []).push(releasedSlot);
        }
        return newlyReleasedSlots;
    }

    private trackUnreleasedSources(): OIMSourceTracker {
        const renderSourceTracker = this.renderSourceTracker;
        const unreleasedSourceTracker = new OIMSourceTracker();
        unreleasedSourceTracker.openSourceTracking();
        const sourceSlots = renderSourceTracker.getTrackedSourceSlots();
        const sourceColumnGroups = renderSourceTracker.getTrackedSourceColumnGroups();
        for (let i = 0; i < sourceSlots.length; i++) {
            const sourceSlot = sourceSlots[i];
            if (!isOIMSlotReleased(sourceSlot)) unreleasedSourceTracker.trackSourceSlot(sourceSlot, sourceColumnGroups[i]);
        }
        const sourceComputeds = renderSourceTracker.getTrackedSourceComputeds();
        let isAnySourceComputedReleased = false;
        for (let i = 0; i < sourceComputeds.length; i++) {
            const sourceComputed = sourceComputeds[i];
            if (isOIMSlotReleased(sourceComputed)) isAnySourceComputedReleased = true;
            else unreleasedSourceTracker.trackSourceComputed(sourceComputed);
        }
        if (isAnySourceComputedReleased) {
            const rootSlots = renderSourceTracker.getTrackedRootSlots();
            for (let i = sourceSlots.length; i < rootSlots.length; i++) {
                const rootSlot = rootSlots[i];
                if (!isOIMSlotReleased(rootSlot)) unreleasedSourceTracker.trackSourceSlot(rootSlot);
            }
        }
        unreleasedSourceTracker.closeSourceTracking();
        return unreleasedSourceTracker;
    }
}
