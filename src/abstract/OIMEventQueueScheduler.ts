import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMEventQueueSchedulerEventType } from '../enum/EOIMEventQueueSchedulerEventType';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { IOIMEventQueueSchedulerEvents } from '../types/IOIMEventQueueSchedulerEvents';

/**
 * Abstract base class for event queue schedulers.
 * Provides common event emission functionality while leaving scheduling strategy to subclasses.
 */
export abstract class OIMEventQueueScheduler {
    protected readonly emitter =
        new OIMEventEmitter<IOIMEventQueueSchedulerEvents>();

    abstract schedule(): void;

    abstract cancel(): void;

    on<K extends keyof IOIMEventQueueSchedulerEvents>(
        event: K,
        handler: TOIMEventHandler<IOIMEventQueueSchedulerEvents[K]>
    ): void {
        this.emitter.on(event, handler);
    }

    off<K extends keyof IOIMEventQueueSchedulerEvents>(
        event: K,
        handler: TOIMEventHandler<IOIMEventQueueSchedulerEvents[K]>
    ): void {
        this.emitter.off(event, handler);
    }

    /**
     * Trigger a flush event. Should be called by subclasses when they execute the scheduled flush.
     */
    protected flush(): void {
        this.emitter.emit(EOIMEventQueueSchedulerEventType.FLUSH, undefined);
    }
}
