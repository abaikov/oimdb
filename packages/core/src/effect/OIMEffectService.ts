import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { IOIMEffectService } from './interfaces/IOIMEffectService';
import type { TOIMComputedContentSlot } from '../computed/types/TOIMComputedContentSlot';
import type { TOIMEffect } from './types/TOIMEffect';
import type { TOIMEffectBody } from './types/TOIMEffectBody';
import type { TOIMSourceTrackingEffectBody } from './types/TOIMSourceTrackingEffectBody';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import { OIMSourceTracker } from '../computed/OIMSourceTracker';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from '../computed/constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
import { OIMChannelService } from '../channel/OIMChannelService';
import { refreshOIMSourceComputeds } from '../computed/utils/refreshOIMSourceComputeds';
import { hasOIMSourceChangedSinceLastRun } from '../computed/utils/hasOIMSourceChangedSinceLastRun';
import { isOIMRevisionAfter } from '../channel/utils/isOIMRevisionAfter';
import { mergeOIMRootSlots } from '../computed/utils/mergeOIMRootSlots';
import { isOIMEffectDisposed } from './utils/isOIMEffectDisposed';
import { isOIMSlotReleased } from '../slot/utils/isOIMSlotReleased';
import { OIM_EFFECT_FLAG_DISPOSED } from './constants/OIM_EFFECT_FLAG_DISPOSED';
import { OIM_EFFECT_FLAG_RUN_SCHEDULED } from './constants/OIM_EFFECT_FLAG_RUN_SCHEDULED';
import { OIM_EFFECT_FLAG_SOURCE_CHECK_OWED } from './constants/OIM_EFFECT_FLAG_SOURCE_CHECK_OWED';
import { swapOIMActiveSourceTracker } from '../computed/utils/swapOIMActiveSourceTracker';

export class OIMEffectService implements IOIMEffectService {
    public static readonly INSTANCE = new OIMEffectService();

    public createEffect(
        channelMap: IOIMChannelMap,
        body: TOIMEffectBody,
        sourceSlots: readonly TOIMSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceComputeds: readonly TOIMComputedContentSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
    ): TOIMEffect {
        if (sourceTrackingComputeds.length !== 0) {
            return this.createEffectOverSourceTrackingComputeds(channelMap, body, sourceSlots, sourceComputeds, sourceTrackingComputeds);
        }
        let distinctSourceComputeds: readonly TOIMComputedContentSlot[] = sourceComputeds;
        if (sourceComputeds.length > 1) {
            const distinctSourceComputedSet = new Set(sourceComputeds);
            if (distinctSourceComputedSet.size !== sourceComputeds.length) distinctSourceComputeds = [...distinctSourceComputedSet];
        }
        const rootSlots = mergeOIMRootSlots(sourceSlots, distinctSourceComputeds);
        const channelSlot = channelMap.defaultChannelSlot;
        const clock = channelSlot.clock;
        const effect: TOIMEffect = {
            effectService: this,
            channelSlot,
            sourceSlots,
            sourceComputeds: distinctSourceComputeds,
            rootSlots,
            positionInFirstSubscribedSlot: -1,
            positionsInOtherSubscribedSlots: undefined,
            columnGroupsByEdge: undefined,
            ranAtRevision: clock.revision,
            ranAtEpoch: clock.epoch,
            effectFlags: 0,
            body,
            cleanup: undefined,
            sourceTracker: undefined,
        };
        try {
            for (let i = 0; i < rootSlots.length; i++) {
                const rootSlot = rootSlots[i];
                this.setPositionInSubscribedSlot(effect, i, rootSlot.owner.subscribeToSlot(rootSlot, effect, i));
            }
            for (let i = 0; i < distinctSourceComputeds.length; i++) {
                const sourceComputedSlot = distinctSourceComputeds[i];
                const edge = rootSlots.length + i;
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
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
    ): TOIMDisposer {
        const effect = this.createEffect(channelMap, body, sourceSlots, sourceComputeds, sourceTrackingComputeds);
        return () => { this.disposeEffect(effect); };
    }

    public createAndRunEffect(
        channelMap: IOIMChannelMap,
        body: TOIMEffectBody,
        sourceSlots: readonly TOIMSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceComputeds: readonly TOIMComputedContentSlot[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[] = OIM_FROZEN_EMPTY_COMPUTED_SLOTS,
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
        sourceTrackingComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[],
    ): TOIMEffect {
        const sourceTracker = new OIMSourceTracker();
        const effect = this.createEffectOverSourceTracker(channelMap, sourceTracker, body);
        try {
            sourceTracker.openSourceTracking();
            for (let i = 0; i < sourceSlots.length; i++) sourceTracker.trackSourceSlot(sourceSlots[i]);
            const outerSourceTracker = swapOIMActiveSourceTracker(sourceTracker);
            try {
                for (let i = 0; i < sourceComputeds.length; i++) void sourceComputeds[i].value;
                for (let i = 0; i < sourceTrackingComputeds.length; i++) void sourceTrackingComputeds[i].value;
            } finally {
                swapOIMActiveSourceTracker(outerSourceTracker);
            }
            if (sourceTracker.closeSourceTracking()) this.resubscribeToTrackedSources(effect, sourceTracker);
        } catch (failure) {
            this.disposeEffect(effect);
            throw failure;
        }
        this.scheduleEffectRunIfWrittenSinceFrameOpened(effect);
        return effect;
    }

    public subscribeEffectToTrackedSources(effect: TOIMEffect, sourceTracker: OIMSourceTracker): boolean {
        const effectSourceTracker = effect.sourceTracker;
        if (effectSourceTracker === undefined) {
            throw new Error('subscribeEffectToTrackedSources: this effect was not created over a source tracker (createEffectOverSourceTracker).');
        }
        if (isOIMEffectDisposed(effect)) return false;
        effectSourceTracker.openSourceTracking();
        const sourceSlots = sourceTracker.getTrackedSourceSlots();
        const sourceColumnGroups = sourceTracker.getTrackedSourceColumnGroups();
        for (let i = 0; i < sourceSlots.length; i++) effectSourceTracker.trackSourceSlot(sourceSlots[i], sourceColumnGroups[i]);
        const sourceComputeds = sourceTracker.getTrackedSourceComputeds();
        for (let i = 0; i < sourceComputeds.length; i++) effectSourceTracker.trackSourceComputed(sourceComputeds[i]);
        try {
            if (!effectSourceTracker.closeSourceTracking()) return false;
            this.resubscribeToTrackedSources(effect, effectSourceTracker);
            return true;
        } catch (failure) {
            this.disposeEffect(effect);
            throw failure;
        }
    }

    public createEffectOverSourceTracker(
        channelMap: IOIMChannelMap, sourceTracker: OIMSourceTracker, body: TOIMEffectBody,
    ): TOIMEffect {
        const channelSlot = channelMap.defaultChannelSlot;
        const clock = channelSlot.clock;
        return {
            effectService: this,
            channelSlot,
            sourceSlots: sourceTracker.getTrackedSourceSlots(),
            sourceComputeds: sourceTracker.getTrackedSourceComputeds(),
            rootSlots: sourceTracker.getTrackedRootSlots(),
            positionInFirstSubscribedSlot: -1,
            positionsInOtherSubscribedSlots: undefined,
            columnGroupsByEdge: undefined,
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
            !frame.isRunning && isOIMRevisionAfter(clock.revision, clock.epoch, frame.openedAtRevision, frame.openedAtEpoch)
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
            && !isOIMRevisionAfter(effect.ranAtRevision, effect.ranAtEpoch, frame.openedAtRevision, frame.openedAtEpoch)
        ) {
            this.runEffect(effect);
        } else {
            this.runEffectIfSourcesChanged(effect);
        }
    }

    public runEffectIfSourcesChanged(effect: TOIMEffect): void {
        refreshOIMSourceComputeds(effect.sourceComputeds);
        if (hasOIMSourceChangedSinceLastRun(effect)) this.runEffect(effect);
        const sourceTracker = effect.sourceTracker;
        if (sourceTracker !== undefined && !isOIMEffectDisposed(effect) && sourceTracker.trackReplacedRootSlots()) {
            this.resubscribeToTrackedSources(effect, sourceTracker);
        }
    }

    public runEffect(effect: TOIMEffect): void {
        const channelClock = effect.channelSlot.clock;
        const ranAtRevision = channelClock.revision;
        const ranAtEpoch = channelClock.epoch;
        this.runCleanup(effect);
        if (isOIMEffectDisposed(effect)) return;
        const body = effect.body;
        const undo = body();
        effect.ranAtRevision = ranAtRevision;
        effect.ranAtEpoch = ranAtEpoch;
        if (typeof undo !== 'function') return;
        if (isOIMEffectDisposed(effect)) undo();
        else effect.cleanup = undo;
    }

    public disposeEffect(effect: TOIMEffect): void {
        effect.effectFlags = (effect.effectFlags | OIM_EFFECT_FLAG_DISPOSED)
            & ~(OIM_EFFECT_FLAG_RUN_SCHEDULED | OIM_EFFECT_FLAG_SOURCE_CHECK_OWED);
        const rootSlots = effect.rootSlots;
        for (let i = 0; i < rootSlots.length; i++) {
            const rootSlot = rootSlots[i];
            if (isOIMSlotReleased(rootSlot)) { this.setPositionInSubscribedSlot(effect, i, -1); continue; }
            this.unsubscribeFrom(effect, rootSlot, i);
        }
        const sourceComputeds = effect.sourceComputeds;
        const edgesIntoRoots = rootSlots.length;
        for (let i = 0; i < sourceComputeds.length; i++) {
            const sourceComputedSlot = sourceComputeds[i];
            if (!isOIMSlotReleased(sourceComputedSlot)) this.unsubscribeFrom(effect, sourceComputedSlot, edgesIntoRoots + i);
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
        const outerSourceTracker = swapOIMActiveSourceTracker(sourceTracker);
        try {
            const undo = sourceTrackingEffectBody();
            swapOIMActiveSourceTracker(outerSourceTracker);
            try {
                if (sourceTracker.closeSourceTracking() && !isOIMEffectDisposed(effect)) this.resubscribeToTrackedSources(effect, sourceTracker);
            } catch (failure) {
                this.disposeEffect(effect);
                if (typeof undo === 'function') undo();
                throw failure;
            }
            return undo;
        } finally {
            swapOIMActiveSourceTracker(outerSourceTracker);
        }
    }

    private resubscribeToTrackedSources(effect: TOIMEffect, sourceTracker: OIMSourceTracker): void {
        const committedRootSlots = effect.rootSlots;
        const committedSourceComputeds = effect.sourceComputeds;
        const trackedRootSlots = sourceTracker.getTrackedRootSlots();
        const trackedSourceComputeds = sourceTracker.getTrackedSourceComputeds();
        const committedColumnGroups = effect.columnGroupsByEdge;
        const trackedColumnGroups = sourceTracker.getTrackedRootColumnGroups();
        const rootSlotCount = trackedRootSlots.length;
        if (
            rootSlotCount === committedRootSlots.length && rootSlotCount !== 0
            && this.isSameSourceComputedSequence(committedSourceComputeds, trackedSourceComputeds)
        ) {
            this.resubscribeToReplacedRootSlots(effect, sourceTracker, trackedRootSlots, trackedColumnGroups, trackedSourceComputeds);
            return;
        }
        const committedEdgeCount = committedRootSlots.length + committedSourceComputeds.length;
        const trackedEdgeCount = trackedRootSlots.length + trackedSourceComputeds.length;
        const sharedEdgeCount = committedEdgeCount < trackedEdgeCount ? committedEdgeCount : trackedEdgeCount;
        let firstChangedEdge = 0;
        while (
            firstChangedEdge < sharedEdgeCount
            && this.getSubscribedSlotAtEdge(committedRootSlots, committedSourceComputeds, firstChangedEdge)
                === this.getSubscribedSlotAtEdge(trackedRootSlots, trackedSourceComputeds, firstChangedEdge)
            && committedColumnGroups?.[firstChangedEdge] === trackedColumnGroups[firstChangedEdge]
        ) firstChangedEdge++;
        const heldEdgeEnd = firstChangedEdge < committedEdgeCount ? trackedEdgeCount : firstChangedEdge;
        let heldEdge = firstChangedEdge;
        let isRunOwed = false;
        try {
            for (; heldEdge < heldEdgeEnd; heldEdge++) {
                const trackedSlot = this.getSubscribedSlotAtEdge(trackedRootSlots, trackedSourceComputeds, heldEdge);
                trackedSlot.owner.holdSlot(trackedSlot);
            }
            for (let edge = firstChangedEdge; edge < committedEdgeCount; edge++) {
                const committedSlot = this.getSubscribedSlotAtEdge(committedRootSlots, committedSourceComputeds, edge);
                if (isOIMSlotReleased(committedSlot)) this.setPositionInSubscribedSlot(effect, edge, -1);
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
            editableEffect.rootSlots = trackedRootSlots;
            effect.columnGroupsByEdge = this.createColumnGroupsByEdge(trackedColumnGroups);
            sourceTracker.commitTrackedSources();
            const channelSlot = effect.channelSlot;
            const isFrameRunning = channelSlot.frame.isRunning;
            for (let edge = firstChangedEdge; edge < trackedEdgeCount; edge++) {
                const trackedSlot = this.getSubscribedSlotAtEdge(trackedRootSlots, trackedSourceComputeds, edge);
                this.setPositionInSubscribedSlot(effect, edge, trackedSlot.owner.subscribeToSlot(trackedSlot, effect, edge, trackedColumnGroups[edge]));
                if (!isFrameRunning && OIMChannelService.INSTANCE.isChangedInCurrentFrame(channelSlot, trackedSlot)) isRunOwed = true;
            }
        } finally {
            for (let edge = firstChangedEdge; edge < heldEdge; edge++) {
                const trackedSlot = this.getSubscribedSlotAtEdge(trackedRootSlots, trackedSourceComputeds, edge);
                trackedSlot.owner.unholdSlot(trackedSlot);
            }
        }
        if (isRunOwed && this.markEffectRunScheduled(effect, true)) OIMChannelService.INSTANCE.scheduleEffectRun(effect.channelSlot, effect);
    }

    private resubscribeToReplacedRootSlots(
        effect: TOIMEffect,
        sourceTracker: OIMSourceTracker,
        trackedRootSlots: readonly TOIMSlot[],
        trackedColumnGroups: readonly (TOIMColumnGroup | undefined)[],
        trackedSourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[],
    ): void {
        const committedRootSlots = effect.rootSlots;
        const committedColumnGroups = effect.columnGroupsByEdge;
        const rootSlotCount = committedRootSlots.length;
        const nextRootSlots: (TOIMSlot | undefined)[] = new Array(rootSlotCount);
        const nextColumnGroups: (TOIMColumnGroup | undefined)[] = new Array(rootSlotCount);
        const addedColumnGroups: (TOIMColumnGroup | undefined)[] = [];
        const addedSlots: TOIMSlot[] = [];
        let edgeShift = 0;
        for (let i = 0; i < rootSlotCount; i++) {
            const trackedSlot = trackedRootSlots[i];
            const trackedColumnGroup = trackedColumnGroups[i];
            const shiftedEdge = i + edgeShift;
            if (
                shiftedEdge >= 0 && shiftedEdge < rootSlotCount
                && committedRootSlots[shiftedEdge] === trackedSlot && nextRootSlots[shiftedEdge] === undefined
                && committedColumnGroups?.[shiftedEdge] === trackedColumnGroup
            ) {
                nextRootSlots[shiftedEdge] = trackedSlot;
                nextColumnGroups[shiftedEdge] = trackedColumnGroup;
                continue;
            }
            const subscribers = trackedSlot.effects;
            const effectEdges = trackedSlot.effectEdges;
            let keptEdge = -1;
            if (subscribers !== undefined && effectEdges !== undefined) {
                for (let at = 0; at < subscribers.length; at++) {
                    if (subscribers[at] !== effect) continue;
                    const edge = effectEdges[at];
                    if (
                        edge < rootSlotCount && nextRootSlots[edge] === undefined && committedRootSlots[edge] === trackedSlot
                        && committedColumnGroups?.[edge] === trackedColumnGroup
                    ) {
                        keptEdge = edge;
                        break;
                    }
                }
            }
            if (keptEdge === -1) {
                addedSlots.push(trackedSlot);
                addedColumnGroups.push(trackedColumnGroup);
            } else {
                nextRootSlots[keptEdge] = trackedSlot;
                nextColumnGroups[keptEdge] = trackedColumnGroup;
                edgeShift = keptEdge - i;
            }
        }
        let heldSlotCount = 0;
        let isRunOwed = false;
        try {
            for (; heldSlotCount < addedSlots.length; heldSlotCount++) {
                const addedSlot = addedSlots[heldSlotCount];
                addedSlot.owner.holdSlot(addedSlot);
            }
            const addedEdges: number[] = new Array(addedSlots.length);
            let added = 0;
            for (let edge = 0; edge < rootSlotCount && added < addedSlots.length; edge++) {
                if (nextRootSlots[edge] !== undefined) continue;
                const committedSlot = committedRootSlots[edge];
                if (isOIMSlotReleased(committedSlot)) this.setPositionInSubscribedSlot(effect, edge, -1);
                else this.unsubscribeFrom(effect, committedSlot, edge);
                nextRootSlots[edge] = addedSlots[added];
                nextColumnGroups[edge] = addedColumnGroups[added];
                addedEdges[added++] = edge;
            }
            const editableEffect = effect as TOIMEditable<TOIMEffect>;
            editableEffect.sourceSlots = sourceTracker.getTrackedSourceSlots();
            editableEffect.sourceComputeds = trackedSourceComputeds;
            editableEffect.rootSlots = nextRootSlots as TOIMSlot[];
            effect.columnGroupsByEdge = this.createColumnGroupsByEdge(nextColumnGroups);
            sourceTracker.commitTrackedSources();
            const channelSlot = effect.channelSlot;
            const isFrameRunning = channelSlot.frame.isRunning;
            for (let i = 0; i < added; i++) {
                const edge = addedEdges[i];
                const addedSlot = addedSlots[i];
                this.setPositionInSubscribedSlot(effect, edge, addedSlot.owner.subscribeToSlot(addedSlot, effect, edge, addedColumnGroups[i]));
                if (!isFrameRunning && OIMChannelService.INSTANCE.isChangedInCurrentFrame(channelSlot, addedSlot)) isRunOwed = true;
            }
        } finally {
            for (let i = 0; i < heldSlotCount; i++) {
                const addedSlot = addedSlots[i];
                addedSlot.owner.unholdSlot(addedSlot);
            }
        }
        if (isRunOwed && this.markEffectRunScheduled(effect, true)) OIMChannelService.INSTANCE.scheduleEffectRun(effect.channelSlot, effect);
    }

    private createColumnGroupsByEdge(
        columnGroups: readonly (TOIMColumnGroup | undefined)[],
    ): (TOIMColumnGroup | undefined)[] | undefined {
        for (let i = 0; i < columnGroups.length; i++) {
            if (columnGroups[i] !== undefined) return columnGroups.slice();
        }
        return undefined;
    }

    private isSameSourceComputedSequence(
        committedSourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[],
        trackedSourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[],
    ): boolean {
        if (committedSourceComputeds.length !== trackedSourceComputeds.length) return false;
        for (let i = 0; i < committedSourceComputeds.length; i++) {
            if (committedSourceComputeds[i] !== trackedSourceComputeds[i]) return false;
        }
        return true;
    }

    private getSubscribedSlotAtEdge(
        rootSlots: readonly TOIMSlot[],
        sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[],
        edge: number,
    ): TOIMSlot {
        return edge < rootSlots.length ? rootSlots[edge] : sourceComputeds[edge - rootSlots.length];
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
