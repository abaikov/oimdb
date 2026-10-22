import type { IOIMPersistScheduler } from './interfaces/IOIMPersistScheduler';
import { OIMPersistSchedulerDrainAttachment } from './OIMPersistSchedulerDrainAttachment';

export class OIMPersistSchedulerMicrotaskDriven implements IOIMPersistScheduler {
    private readonly persistSchedulerDrainAttachment = new OIMPersistSchedulerDrainAttachment();
    private isStarted = false;
    private isDrainScheduled = false;

    private readonly onMicrotaskReached = (): void => {
        this.isDrainScheduled = false;
        const drain = this.persistSchedulerDrainAttachment.drain;
        if (!this.isStarted || drain === undefined) return;
        drain();
    };

    public attachDrain(drain: () => void): void {
        this.persistSchedulerDrainAttachment.attachDrain(drain, 'OIMPersistSchedulerMicrotaskDriven');
    }

    public start(): void {
        this.isStarted = true;
    }

    public stop(): void {
        this.isStarted = false;
    }

    public requestDrain(): void {
        if (!this.isStarted || this.isDrainScheduled) return;
        this.isDrainScheduled = true;
        queueMicrotask(this.onMicrotaskReached);
    }
}
