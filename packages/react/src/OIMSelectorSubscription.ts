import { OIMEffectService, OIMSourceTracker, isOIMAnySlotChangedAfter, isOIMSlotReleased } from '@oimdb/core';
import type { OIMDB, TOIMDisposer, TOIMEffect } from '@oimdb/core';
import { assertOIMOneChannel } from './assertOIMOneChannel';

export class OIMSelectorSubscription {
    private version = 0;

    private effect: TOIMEffect | undefined = undefined;

    private onStoreChange: (() => void) | undefined = undefined;

    private committedSourceTracker: OIMSourceTracker | undefined = undefined;

    private committedAtRevision = 0;

    private committedAtEpoch = 0;

    public constructor(private readonly db: OIMDB) {}

    public readonly getVersion = (): number => this.version;

    public readonly subscribe = (onStoreChange: () => void): TOIMDisposer => {
        const effect = OIMEffectService.INSTANCE.createEffectOverSourceTracker(this.db, new OIMSourceTracker(), this.notify);
        this.effect = effect;
        this.onStoreChange = onStoreChange;
        const committedSourceTracker = this.committedSourceTracker;
        if (committedSourceTracker !== undefined) this.subscribeEffectToSourceTracker(effect, committedSourceTracker);
        this.version++;
        return () => {
            this.effect = undefined;
            this.onStoreChange = undefined;
            OIMEffectService.INSTANCE.disposeEffect(effect);
        };
    };

    public commitRender(sourceTracker: OIMSourceTracker, renderedAtRevision: number, renderedAtEpoch: number): void {
        this.committedSourceTracker = sourceTracker;
        this.committedAtRevision = renderedAtRevision;
        this.committedAtEpoch = renderedAtEpoch;
        const effect = this.effect;
        if (effect === undefined) return;
        if (this.subscribeEffectToSourceTracker(effect, sourceTracker)) this.notify();
    }

    private readonly notify = (): void => {
        this.version++;
        this.onStoreChange?.();
    };

    private subscribeEffectToSourceTracker(effect: TOIMEffect, sourceTracker: OIMSourceTracker): boolean {
        const rootSlots = sourceTracker.getTrackedRootSlots();
        for (let i = 0; i < rootSlots.length; i++) {
            const rootSlot = rootSlots[i];
            if (isOIMSlotReleased(rootSlot)) return true;
            assertOIMOneChannel(this.db, rootSlot, 'useOIMSelector');
        }
        const isSourcesMoved = OIMEffectService.INSTANCE.subscribeEffectToTrackedSources(effect, sourceTracker);
        return isSourcesMoved || isOIMAnySlotChangedAfter(rootSlots, this.committedAtRevision, this.committedAtEpoch);
    }
}
