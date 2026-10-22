import type { TOIMEffect } from '../computed/types/TOIMEffect';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../slot/types/TOIMSlotEditable';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import type { TOIMChannelSlot } from './types/TOIMChannelSlot';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { IOIMSubframeCloseListener } from '../slot/interfaces/IOIMSubframeCloseListener';
import { OIMFlushSchedulerService } from '../schedule/OIMFlushSchedulerService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import { OIM_REVISIONS_PER_EPOCH } from './constants/OIM_REVISIONS_PER_EPOCH';
import { oimIsRevisionAfter } from './utils/oimIsRevisionAfter';

export class OIMChannelService extends OIMFlushSchedulerService<TOIMChannelSlot> {
    public static readonly INSTANCE = new OIMChannelService();

    public scheduleEffectRun(channelSlot: TOIMChannelSlot, effect: TOIMEffect): void {
        channelSlot.effectChannelQueue.enqueueEntry(effect);
        this.requestFlush(channelSlot);
    }

    public isRefusingWrites(channelSlot: TOIMChannelSlot): boolean {
        return channelSlot.isFlushing;
    }

    public assertNotFlushing(channelSlot: TOIMChannelSlot): void {
        if (this.isRefusingWrites(channelSlot)) {
            throw new Error(
                'OIMChannelService: writes are refused for the whole of a flush — onBeforeFlush and every '
                + 'after-each-frame handler included, not only the frame body. Write after flush() returns.',
            );
        }
    }

    public isSubframeOpen(channelSlot: TOIMChannelSlot): boolean { return channelSlot.subframesOpen > 0; }

    public listChangedStoreSlot(
        channelSlot: TOIMChannelSlot, storeSlot: TOIMStoreSlot, subframeCloseListener: IOIMSubframeCloseListener,
    ): void {
        channelSlot.changedStoreSlotChannelQueue.enqueueEntry(storeSlot);
        channelSlot.changedStoreSlotOwnerChannelQueue.enqueueEntry(subframeCloseListener);
    }

    public openSubframe(channelSlot: TOIMChannelSlot): void { channelSlot.subframesOpen++; }

    public closeSubframe(channelSlot: TOIMChannelSlot): void {
        if (channelSlot.subframesOpen > 1) {
            channelSlot.subframesOpen--;
            return;
        }
        let hasFailed = false;
        let firstFailure: unknown;
        const changedStoreSlotChannelQueue = channelSlot.changedStoreSlotChannelQueue;
        const changedStoreSlotOwnerChannelQueue = channelSlot.changedStoreSlotOwnerChannelQueue;
        try {
            for (let i = 0; i < changedStoreSlotChannelQueue.getEntryCount(); i++) {
                try {
                    changedStoreSlotOwnerChannelQueue.getEntryAt(i).onStoreSlotSubframeClosed(changedStoreSlotChannelQueue.getEntryAt(i));
                } catch (failure) {
                    if (!hasFailed) firstFailure = failure;
                    hasFailed = true;
                }
            }
        } finally {
            changedStoreSlotChannelQueue.keepFirstEntries(0);
            changedStoreSlotOwnerChannelQueue.keepFirstEntries(0);
            channelSlot.subframesOpen--;
        }
        if (channelSlot.flushRequestedInSubframe) {
            channelSlot.flushRequestedInSubframe = false;
            this.requestFlush(channelSlot);
        }
        if (hasFailed) throw firstFailure;
    }

    public subscribeAfterEachFrame(channelSlot: TOIMChannelSlot, handler: () => void): TOIMDisposer {
        const afterEachFrame = channelSlot.frame.afterEachFrame;
        const subscription = (): void => { handler(); };
        afterEachFrame.add(subscription);
        return () => { afterEachFrame.delete(subscription); };
    }

    public subscribeAfterEachFlush(channelSlot: TOIMChannelSlot, handler: () => void): TOIMDisposer {
        const afterEachFlush = channelSlot.afterEachFlush;
        const subscription = (): void => { handler(); };
        afterEachFlush.add(subscription);
        return () => { afterEachFlush.delete(subscription); };
    }

    public subscribeOnceAfterFrame(channelSlot: TOIMChannelSlot, handler: () => void): TOIMDisposer {
        const afterEachFrame = channelSlot.frame.afterEachFrame;
        const once = (): void => {
            afterEachFrame.delete(once);
            handler();
        };
        afterEachFrame.add(once);
        return () => { afterEachFrame.delete(once); };
    }

    public isChangedInCurrentFrame(channelSlot: TOIMChannelSlot, slot: TOIMSlot): boolean {
        const frame = channelSlot.frame;
        return oimIsRevisionAfter(slot.changedAtRevision, slot.changedAtEpoch, frame.openedAtRevision, frame.openedAtEpoch);
    }

    public write(channelSlot: TOIMChannelSlot, slot: TOIMSlot): void {
        this.assertNotFlushing(channelSlot);
        this.writeWithoutFlushCheck(channelSlot, slot);
    }

    public writeWithoutFlushCheck(channelSlot: TOIMChannelSlot, slot: TOIMSlot): void {
        if (slot.holdCount === 0) return;
        const clock = channelSlot.clock;
        if (clock.revision >= OIM_REVISIONS_PER_EPOCH - 1) {
            clock.revision = 0;
            clock.epoch++;
        } else {
            clock.revision++;
        }
        const dependents = slot.effects;
        const slotEditable = slot as TOIMSlotEditable<TOIMSlot>;
        const effectChannelQueue = channelSlot.effectChannelQueue;
        let owesAFrame = false;
        if (dependents !== undefined && dependents.length !== 0 && !this.isChangedInCurrentFrame(channelSlot, slot)) {
            const owed = dependents.length;
            for (let i = 0; i < owed; i++) {
                const dependent = dependents[i];
                if (dependent.effectService.markEffectRunScheduled(dependent, false)) effectChannelQueue.enqueueEntry(dependent);
            }
            owesAFrame = true;
        }
        slotEditable.changedAtRevision = clock.revision;
        slotEditable.changedAtEpoch = clock.epoch;
        if (!owesAFrame && (channelSlot.flushRequested
            || (channelSlot.frame.afterEachFrame.size === 0 && effectChannelQueue.getEntryCount() === 0))) return;
        if (channelSlot.timer === undefined) return;
        this.requestFlush(channelSlot);
    }

    private requestFlush(channelSlot: TOIMChannelSlot): void {
        if (channelSlot.dropped) return;
        if (channelSlot.subframesOpen !== 0) {
            channelSlot.flushRequestedInSubframe = true;
            return;
        }
        if (channelSlot.flushRequested || channelSlot.timer === undefined || channelSlot.frame.isRunning) return;
        channelSlot.flushRequested = true;
        try {
            this.schedule(channelSlot, 0);
        } catch (failure) {
            channelSlot.flushRequested = false;
            throw failure;
        }
    }

    public dropChannelSlot(channelSlot: TOIMChannelSlot): void {
        channelSlot.dropped = true;
        this.cancelSchedule(channelSlot);
        if (!channelSlot.isFlushing) OIMUnusedSlotCollectorService.INSTANCE.flush(channelSlot.collectorSlot.unusedSlotCollectorSlot);
        channelSlot.effectChannelQueue.keepFirstEntries(0);
        channelSlot.frame.afterEachFrame.clear();
        channelSlot.afterEachFlush.clear();
    }

    public flush(channelSlot: TOIMChannelSlot): void {
        if (channelSlot.dropped) return;
        if (channelSlot.frame.isRunning) {
            throw new Error(
                'OIMChannelService.flush: a frame is already running, and a second one inside it would end the first. ' +
                'A subscriber is told during the frame; to do work after it, subscribe with subscribeAfterEachFrame.',
            );
        }
        if (channelSlot.subframesOpen > 0) {
            throw new Error(
                'OIMChannelService.flush: a subframe is open — a write is still landing (or openSubframe() was called and ' +
                'closeSubframe() was not yet), and the frame cannot close while a subframe is open. Flush after the ' +
                'write returns; the outermost closeSubframe asks for the frame it owes by itself.',
            );
        }
        if (channelSlot.isFlushing) return;
        channelSlot.isFlushing = true;
        try {
            const frame = channelSlot.frame;
            const clock = channelSlot.clock;
            if (channelSlot.effectChannelQueue.getEntryCount() !== 0 || frame.afterEachFrame.size !== 0
                || channelSlot.onBeforeFlush !== undefined) {
                this.runFrame(channelSlot);
            } else {
                channelSlot.flushRequested = false;
                this.cancelSchedule(channelSlot);
                frame.openedAtRevision = clock.revision;
                frame.openedAtEpoch = clock.epoch;
            }
        } finally {
            channelSlot.isFlushing = false;
            try {
                OIMUnusedSlotCollectorService.INSTANCE.flush(channelSlot.collectorSlot.unusedSlotCollectorSlot);
            } catch (error) {
                channelSlot.errorPolicy.onErrorCaught(error);
            } finally {
                this.dispatchAfterEachFlush(channelSlot);
            }
        }
    }

    private runFrame(channelSlot: TOIMChannelSlot): void {
        channelSlot.flushRequested = false;
        this.cancelSchedule(channelSlot);
        const onBeforeFlush = channelSlot.onBeforeFlush;
        if (onBeforeFlush !== undefined) {
            try {
                onBeforeFlush();
            } catch (error) {
                channelSlot.errorPolicy.onErrorCaught(error);
            }
        }
        const frame = channelSlot.frame;
        frame.isRunning = true;
        try {
            const effectChannelQueue = channelSlot.effectChannelQueue;
            const effectCount = effectChannelQueue.getEntryCount();
            for (let i = 0; i < effectCount; i++) {
                const effect = effectChannelQueue.takeEntryAt(i);
                if (effect === undefined) continue;
                try { effect.effectService.runScheduledEffect(effect); } catch (error) { channelSlot.errorPolicy.onErrorCaught(error); }
            }
            effectChannelQueue.forgetTakenEntries();
        } finally {
            frame.isRunning = false;
            frame.openedAtRevision = channelSlot.clock.revision;
            frame.openedAtEpoch = channelSlot.clock.epoch;
        }
        this.dispatchAfterEachFrame(channelSlot);
    }

    private dispatchAfterEachFrame(channelSlot: TOIMChannelSlot): void {
        const handlers = channelSlot.frame.afterEachFrame;
        if (handlers.size === 0) return;
        const afterEachFrameHandlerChannelQueue = channelSlot.afterEachFrameHandlerChannelQueue;
        for (const handler of handlers) afterEachFrameHandlerChannelQueue.enqueueEntry(handler);
        try {
            for (let i = 0; i < afterEachFrameHandlerChannelQueue.getEntryCount(); i++) {
                const handler = afterEachFrameHandlerChannelQueue.getEntryAt(i);
                if (!handlers.has(handler)) continue;
                try { handler(); } catch (error) { channelSlot.errorPolicy.onErrorCaught(error); }
            }
        } finally {
            afterEachFrameHandlerChannelQueue.keepFirstEntries(0);
        }
    }

    private dispatchAfterEachFlush(channelSlot: TOIMChannelSlot): void {
        const afterEachFlush = channelSlot.afterEachFlush;
        if (afterEachFlush.size === 0) return;
        for (const handler of afterEachFlush) {
            try { handler(); } catch (error) { channelSlot.errorPolicy.onErrorCaught(error); }
        }
    }
}
