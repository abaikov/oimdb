import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMEventQueueScheduler } from '../abstract/OIMEventQueueScheduler';

import { OIMEventQueueSchedulerFactory } from '../core/event-queue-scheduler/OIMEventQueueSchedulerFactory';
import { TOIMSchedulerType } from '../types/TOIMSchedulerType';

/**
 * DX Context that manages shared event queue for a group of collections/indexes.
 * Allows multiple independent contexts (perfect for React, testing, etc.).
 */
export class OIMDxDb {
    private readonly eventQueue: OIMEventQueue;
    private readonly scheduler: OIMEventQueueScheduler;

    constructor(schedulerType: TOIMSchedulerType = 'microtask') {
        this.scheduler = this.createScheduler(schedulerType);
        this.eventQueue = new OIMEventQueue({ scheduler: this.scheduler });
    }

    private createScheduler(type: TOIMSchedulerType): OIMEventQueueScheduler {
        switch (type) {
            case 'microtask':
                return OIMEventQueueSchedulerFactory.createMicrotask();
            case 'animationFrame':
                return OIMEventQueueSchedulerFactory.createAnimationFrame();
            case 'timeout':
                return OIMEventQueueSchedulerFactory.createTimeout();
            case 'immediate':
                return OIMEventQueueSchedulerFactory.createImmediate();

            default:
                return OIMEventQueueSchedulerFactory.createMicrotask();
        }
    }

    /**
     * Get the shared event queue for this context
     */
    public getEventQueue(): OIMEventQueue {
        return this.eventQueue;
    }

    /**
     * Get the scheduler for this context
     */
    public getScheduler(): OIMEventQueueScheduler {
        return this.scheduler;
    }

    /**
     * Clean up the context and all its resources
     */
    public destroy(): void {
        this.eventQueue.destroy();
    }
}
