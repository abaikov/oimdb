import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { IOIMEffectService } from './interfaces/IOIMEffectService';
import type { TOIMComputedContentSlot } from '../computed/types/TOIMComputedContentSlot';
import type { TOIMEffect } from './types/TOIMEffect';
import type { TOIMEffectBody } from './types/TOIMEffectBody';
import type { TOIMSourceTrackingEffectBody } from './types/TOIMSourceTrackingEffectBody';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import { OIMSourceTracker } from '../computed/OIMSourceTracker';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from '../computed/constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { OIMChannelService } from '../channel/OIMChannelService';
import { oimRefreshSourceComputeds } from '../computed/utils/oimRefreshSourceComputeds';
import { oimHasSourceChangedSinceLastRun } from '../computed/utils/oimHasSourceChangedSinceLastRun';
import { oimIsRevisionAfter } from '../channel/utils/oimIsRevisionAfter';
import { oimMergeRootSlots } from '../computed/utils/oimMergeRootSlots';
import { oimIsEffectDisposed } from './utils/oimIsEffectDisposed';
import { oimIsSlotReleased } from '../slot/utils/oimIsSlotReleased';
import { OIM_EFFECT_FLAG_DISPOSED } from './constants/OIM_EFFECT_FLAG_DISPOSED';
import { OIM_EFFECT_FLAG_RUN_SCHEDULED } from './constants/OIM_EFFECT_FLAG_RUN_SCHEDULED';
import { OIM_EFFECT_FLAG_SOURCE_CHECK_OWED } from './constants/OIM_EFFECT_FLAG_SOURCE_CHECK_OWED';

export class OIMEffectService implements IOIMEffectService {
    public static readonly INSTANCE = new OIMEffectService();

    public createEffect(
        channelMap: IOIMChannelMap,
        body: TOIMEffectBody,
        sourceSlots: readonly TOIMSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceComputeds: readonly TOIMComputedContentSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
    ): TOIMEffect {
        if (sourceTrackingComputeds.length !== 0) {
            return this.createEffectOverSourceTrackingComputeds(channelMap, body, sourceSlots, sourceComputeds, sourceTrackingComputeds);
        }
        let distinctSourceComputeds: readonly TOIMComputedContentSlot[] = sourceComputeds;
        if (sourceComputeds.length > 1) {
            const distinctSourceComputedSet = new Set(sourceComputeds);
            if (distinctSourceComputedSet.size !== sourceComputeds.length) distinctSourceComputeds = [...distinctSourceComputedSet];
        }
        const allRootSlots = oimMergeRootSlots(sourceSlots, distinctSourceComputeds);
        const channelSlot = channelMap.defaultChannelSlot;
        const clock = channelSlot.clock;
        const effect: TOIMEffect = {
            effectService: this,
            channelSlot,
            sourceSlots,
            sourceComputeds: distinctSourceComputeds,
            allRootSlots,
            positionInFirstSubscribedSlot: -1,
            positionsInOtherSubscribedSlots: undefined,
            ranAtRevision: clock.revision,
            ranAtEpoch: clock.epoch,
            effectFlags: 0,
            body,
            cleanup: undefined,
            sourceTracker: undefined,
        };
        try {
            for (let i = 0; i < allRootSlots.length; i++) {
                const rootSlot = allRootSlots[i];
                this.setPositionInSubscribedSlot(effect, i, rootSlot.owner.subscribeToSlot(rootSlot, effect, i));
            }
            for (let i = 0; i < distinctSourceComputeds.length; i++) {
                const sourceComputedSlot = distinctSourceComputeds[i];
                const edge = allRootSlots.length + i;
                this.setPositionInSubscribedSlot(effect, edge, sourceComputedSlot.owner.subscribeToSlot(sourceComputedSlot, effect, edge));
            }
        } catch (failure) {
            this.disposeEffect(effect);
            throw failure;
        }
        this.scheduleEffectRunIfWrittenSinceFrameOpened(effect);
        return effect;
    }

    public subscribeEffect(
        channelMap: IOIMChannelMap,
        body: TOIMEffectBody,
        sourceSlots: readonly TOIMSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceComputeds: readonly TOIMComputedContentSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
    ): TOIMDisposer {
        const effect = this.createEffect(channelMap, body, sourceSlots, sourceComputeds, sourceTrackingComputeds);
        return () => { this.disposeEffect(effect); };
    }

    public createAndRunEffect(
        channelMap: IOIMChannelMap,
        body: TOIMEffectBody,
        sourceSlots: readonly TOIMSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceComputeds: readonly TOIMComputedContentSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
    ): TOIMEffect {
        const effect = this.createEffect(channelMap, body, sourceSlots, sourceComputeds, sourceTrackingComputeds);
        try {
            this.runEffect(effect);
        } catch (refusal) {
            this.disposeEffect(effect);
            throw refusal;
        }
        return effect;
    }

    public createSourceTrackingEffect(
        channelMap: IOIMChannelMap, sourceTrackingEffectBody: TOIMSourceTrackingEffectBody,
    ): TOIMEffect {
        const sourceTracker = new OIMSourceTracker();
        const effect = this.createEffectOverSourceTracker(
            channelMap, sourceTracker, () => this.runSourceTrackingEffectBody(effect, sourceTracker, sourceTrackingEffectBody),
        );
        try {
            this.runEffect(effect);
        } catch (failure) {
            this.disposeEffect(effect);
            throw failure;
        }
        return effect;
    }

    private createEffectOverSourceTrackingComputeds(
        channelMap: IOIMChannelMap,
        body: TOIMEffectBody,
        sourceSlots: readonly TOIMSlot[],
        sourceComputeds: readonly TOIMComputedContentSlot[],
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker>[],
    ): TOIMEffect {
        const sourceTracker = new OIMSourceTracker();
        const effect = this.createEffectOverSourceTracker(channelMap, sourceTracker, body);
        try {
            sourceTracker.openSourceTracking();
            for (let i = 0; i < sourceSlots.length; i++) sourceTracker.readSourceSlot(sourceSlots[i]);
            for (let i = 0; i < sourceComputeds.length; i++) sourceTracker.readSourceComputedValue(sourceComputeds[i]);
            for (let i = 0; i < sourceTrackingComputeds.length; i++) sourceTracker.readSourceComputedValue(sourceTrackingComputeds[i]);
            if (sourceTracker.closeSourceTracking()) this.resubscribeToTrackedSources(effect, sourceTracker);
        } catch (failure) {
            this.disposeEffect(effect);
            throw failure;
        }
        this.scheduleEffectRunIfWrittenSinceFrameOpened(effect);
        return effect;
    }

    private createEffectOverSourceTracker(
        channelMap: IOIMChannelMap, sourceTracker: OIMSourceTracker, body: TOIMEffectBody,
    ): TOIMEffect {
        const channelSlot = channelMap.defaultChannelSlot;
        const clock = channelSlot.clock;
        return {
            effectService: this,
            channelSlot,
            sourceSlots: sourceTracker.getTrackedSourceSlots(),
            sourceComputeds: sourceTracker.getTrackedSourceComputeds(),
            allRootSlots: sourceTracker.getTrackedAllRootSlots(),
            positionInFirstSubscribedSlot: -1,
            positionsInOtherSubscribedSlots: undefined,
            ranAtRevision: clock.revision,
            ranAtEpoch: clock.epoch,
            effectFlags: 0,
            body,
            cleanup: undefined,
            sourceTracker,
        };
    }

    private scheduleEffectRunIfWrittenSinceFrameOpened(effect: TOIMEffect): void {
        const channelSlot = effect.channelSlot;
        const clock = channelSlot.clock;
        const frame = channelSlot.frame;
        if (
            !frame.isRunning && oimIsRevisionAfter(clock.revision, clock.epoch, frame.openedAtRevision, frame.openedAtEpoch)
            && this.markEffectRunScheduled(effect, true)
        ) {
            OIMChannelService.INSTANCE.scheduleEffectRun(channelSlot, effect);
        }
    }

    public markEffectRunScheduled(effect: TOIMEffect, isSourceCheckOwed: boolean): boolean {
        const effectFlags = effect.effectFlags;
        if ((effectFlags & OIM_EFFECT_FLAG_RUN_SCHEDULED) !== 0) {
            if (isSourceCheckOwed) effect.effectFlags = effectFlags | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED;
            return false;
        }
        effect.effectFlags = isSourceCheckOwed
            ? effectFlags | OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED
            : effectFlags | OIM_EFFECT_FLAG_RUN_SCHEDULED;
        return true;
    }

    public runScheduledEffect(effect: TOIMEffect): void {
        const effectFlags = effect.effectFlags;
        if ((effectFlags & OIM_EFFECT_FLAG_RUN_SCHEDULED) === 0) return;
        effect.effectFlags = effectFlags & ~(OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED);
        const frame = effect.channelSlot.frame;
        if (
            (effectFlags & OIM_EFFECT_FLAG_SOURCE_CHECK_OWED) === 0 && effect.sourceComputeds.length === 0
            && !oimIsRevisionAfter(effect.ranAtRevision, effect.ranAtEpoch, frame.openedAtRevision, frame.openedAtEpoch)
        ) {
            this.runEffect(effect);
        } else {
            this.runEffectIfSourcesChanged(effect);
        }
    }

    public runEffectIfSourcesChanged(effect: TOIMEffect): void {
        oimRefreshSourceComputeds(effect.sourceComputeds);
        if (oimHasSourceChangedSinceLastRun(effect)) this.runEffect(effect);
        const sourceTracker = effect.sourceTracker;
        if (sourceTracker !== undefined && !oimIsEffectDisposed(effect) && sourceTracker.trackReplacedRootSlots()) {
            this.resubscribeToTrackedSources(effect, sourceTracker);
        }
    }

    public runEffect(effect: TOIMEffect): void {
        const channelClock = effect.channelSlot.clock;
        const ranAtRevision = channelClock.revision;
        const ranAtEpoch = channelClock.epoch;
        this.runCleanup(effect);
        if (oimIsEffectDisposed(effect)) return;
        const body = effect.body;
        const undo = body();
        effect.ranAtRevision = ranAtRevision;
        effect.ranAtEpoch = ranAtEpoch;
        if (typeof undo !== 'function') return;
        if (oimIsEffectDisposed(effect)) undo();
        else effect.cleanup = undo;
    }

    public disposeEffect(effect: TOIMEffect): void {
        effect.effectFlags = (effect.effectFlags | OIM_EFFECT_FLAG_DISPOSED)
            & ~(OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED);
        const allRootSlots = effect.allRootSlots;
        for (let i = 0; i < allRootSlots.length; i++) {
            const rootSlot = allRootSlots[i];
            if (oimIsSlotReleased(rootSlot)) { this.setPositionInSubscribedSlot(effect, i, -1); continue; }
            this.unsubscribeFrom(effect, rootSlot, i);
        }
        const sourceComputeds = effect.sourceComputeds;
        const edgesIntoRoots = allRootSlots.length;
        for (let i = 0; i < sourceComputeds.length; i++) {
            const sourceComputedSlot = sourceComputeds[i];
            if (!oimIsSlotReleased(sourceComputedSlot)) this.unsubscribeFrom(effect, sourceComputedSlot, edgesIntoRoots + i);
        }
        this.runCleanup(effect);
    }

    public setPositionInSubscribedSlot(effect: TOIMEffect, edge: number, positionInSlot: number): void {
        if (edge === 0) {
            effect.positionInFirstSubscribedSlot = positionInSlot;
            return;
        }
        (effect.positionsInOtherSubscribedSlots ??= [])[edge - 1] = positionInSlot;
    }

    private runSourceTrackingEffectBody(
        effect: TOIMEffect,
        sourceTracker: OIMSourceTracker,
        sourceTrackingEffectBody: TOIMSourceTrackingEffectBody,
    ): (() => void) | void {
        sourceTracker.openSourceTracking();
        const undo = sourceTrackingEffectBody(sourceTracker);
        try {
            if (sourceTracker.closeSourceTracking()) this.resubscribeToTrackedSources(effect, sourceTracker);
        } catch (failure) {
            this.disposeEffect(effect);
            if (typeof undo === 'function') undo();
            throw failure;
        }
        return undo;
    }

    private resubscribeToTrackedSources(effect: TOIMEffect, sourceTracker: OIMSourceTracker): void {
        const committedAllRootSlots = effect.allRootSlots;
        const committedSourceComputeds = effect.sourceComputeds;
        const trackedAllRootSlots = sourceTracker.getTrackedAllRootSlots();
        const trackedSourceComputeds = sourceTracker.getTrackedSourceComputeds();
        const committedEdgeCount = committedAllRootSlots.length + committedSourceComputeds.length;
        const trackedEdgeCount = trackedAllRootSlots.length + trackedSourceComputeds.length;
        const sharedEdgeCount = committedEdgeCount < trackedEdgeCount ? committedEdgeCount : trackedEdgeCount;
        let firstChangedEdge = 0;
        while (
            firstChangedEdge < sharedEdgeCount
            && this.getSubscribedSlotAtEdge(committedAllRootSlots, committedSourceComputeds, firstChangedEdge)
                === this.getSubscribedSlotAtEdge(trackedAllRootSlots, trackedSourceComputeds, firstChangedEdge)
        ) firstChangedEdge++;
        const heldEdgeEnd = firstChangedEdge < committedEdgeCount ? trackedEdgeCount : firstChangedEdge;
        let heldEdge = firstChangedEdge;
        let isRunOwed = false;
        try {
            for (; heldEdge < heldEdgeEnd; heldEdge++) {
                const trackedSlot = this.getSubscribedSlotAtEdge(trackedAllRootSlots, trackedSourceComputeds, heldEdge);
                trackedSlot.owner.holdSlot(trackedSlot);
            }
            for (let edge = firstChangedEdge; edge < committedEdgeCount; edge++) {
                const committedSlot = this.getSubscribedSlotAtEdge(committedAllRootSlots, committedSourceComputeds, edge);
                if (oimIsSlotReleased(committedSlot)) this.setPositionInSubscribedSlot(effect, edge, -1);
                else this.unsubscribeFrom(effect, committedSlot, edge);
            }
            for (let edge = committedEdgeCount; edge < trackedEdgeCount; edge++) this.setPositionInSubscribedSlot(effect, edge, -1);
            const positionsInOtherSubscribedSlots = effect.positionsInOtherSubscribedSlots;
            const otherEdgeCount = trackedEdgeCount > 0 ? trackedEdgeCount - 1 : 0;
            if (positionsInOtherSubscribedSlots !== undefined && positionsInOtherSubscribedSlots.length > otherEdgeCount) {
                positionsInOtherSubscribedSlots.length = otherEdgeCount;
            }
            const editableEffect = effect as TOIMEditable<TOIMEffect>;
            editableEffect.sourceSlots = sourceTracker.getTrackedSourceSlots();
            editableEffect.sourceComputeds = trackedSourceComputeds;
            editableEffect.allRootSlots = trackedAllRootSlots;
            sourceTracker.commitTrackedSources();
            const channelSlot = effect.channelSlot;
            const isFrameRunning = channelSlot.frame.isRunning;
            for (let edge = firstChangedEdge; edge < trackedEdgeCount; edge++) {
                const trackedSlot = this.getSubscribedSlotAtEdge(trackedAllRootSlots, trackedSourceComputeds, edge);
                this.setPositionInSubscribedSlot(effect, edge, trackedSlot.owner.subscribeToSlot(trackedSlot, effect, edge));
                if (!isFrameRunning && OIMChannelService.INSTANCE.isChangedInCurrentFrame(channelSlot, trackedSlot)) isRunOwed = true;
            }
        } finally {
            for (let edge = firstChangedEdge; edge < heldEdge; edge++) {
                const trackedSlot = this.getSubscribedSlotAtEdge(trackedAllRootSlots, trackedSourceComputeds, edge);
                trackedSlot.owner.unholdSlot(trackedSlot);
            }
        }
        if (isRunOwed && this.markEffectRunScheduled(effect, true)) OIMChannelService.INSTANCE.scheduleEffectRun(effect.channelSlot, effect);
    }

    private getSubscribedSlotAtEdge(
        allRootSlots: readonly TOIMSlot[],
        sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[],
        edge: number,
    ): TOIMSlot {
        return edge < allRootSlots.length ? allRootSlots[edge] : sourceComputeds[edge - allRootSlots.length];
    }

    private runCleanup(effect: TOIMEffect): void {
        const undo = effect.cleanup;
        if (undo === undefined) return;
        effect.cleanup = undefined;
        undo();
    }

    private unsubscribeFrom(effect: TOIMEffect, subscribedSlot: TOIMSlot, edge: number): void {
        const positionInSlot = edge === 0
            ? effect.positionInFirstSubscribedSlot
            : (effect.positionsInOtherSubscribedSlots?.[edge - 1] ?? -1);
        if (positionInSlot < 0) return;
        this.setPositionInSubscribedSlot(effect, edge, -1);
        subscribedSlot.owner.unsubscribeFromSlot(subscribedSlot, positionInSlot, effect);
    }
}
