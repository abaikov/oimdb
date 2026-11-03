import { OIMChannelService } from '@oimdb/core';
import type { TOIMChannelSlot, TOIMDisposer } from '@oimdb/core';
import { OIM_NOOP_DISPOSER } from '@oimdb/core';
import type { IOIMPersistScheduler } from './interfaces/IOIMPersistScheduler';
import { OIMPersistSchedulerDrainAttachment } from './OIMPersistSchedulerDrainAttachment';
import type { TOIMPersistSchedulerFrameDrivenOptions } from './types/TOIMPersistSchedulerFrameDrivenOptions';

export class OIMPersistFrameScheduler implements IOIMPersistScheduler {
    private readonly channelSlot: TOIMChannelSlot;
    private readonly persistSchedulerDrainAttachment = new OIMPersistSchedulerDrainAttachment();
    private disposer: TOIMDisposer = OIM_NOOP_DISPOSER;
    private isDrainRequested = false;

    public constructor(persistSchedulerFrameDrivenOptions: TOIMPersistSchedulerFrameDrivenOptions) {
        this.channelSlot = persistSchedulerFrameDrivenOptions.channelSlot;
    }

    public attachDrain(drain: () => void): void {
        this.persistSchedulerDrainAttachment.attachDrain(drain, 'OIMPersistFrameScheduler');
    }

    public start(): void {
        const drain = this.persistSchedulerDrainAttachment.drain;
        if (drain === undefined) {
            throw new Error(
                'OIMPersistFrameScheduler: no persistor is attached, so there is nothing to call after a frame. '
                + 'Hand the scheduler to one OIMPersistor at construction.',
            );
        }
        this.disposer();
        this.disposer = OIMChannelService.INSTANCE.subscribeAfterEachFrame(this.channelSlot, () => {
            if (!this.isDrainRequested) return;
            this.isDrainRequested = false;
            drain();
        });
    }

    public stop(): void {
        this.disposer();
        this.disposer = OIM_NOOP_DISPOSER;
        this.isDrainRequested = false;
    }

    public requestDrain(): void {
        this.isDrainRequested = true;
    }
}
