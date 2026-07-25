import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMEventQueueSchedulerEventType } from '../enums/EOIMEventQueueSchedulerEventType';
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

    /**
     * Detach a Node timer handle from the event loop, returning it unchanged.
     *
     * A pending flush must never be a reason for a process to stay alive: if
     * nothing else is running there is no UI left to update, and the flush is
     * moot. Without this a scheduled-but-not-yet-run flush keeps Node awake —
     * which is why a test suite that leaves a queue scheduled reports
     * "a worker process has failed to exit gracefully".
     *
     * In the browser `setTimeout` returns a number, which has no `unref`, so the
     * call is guarded and the handle passes straight through.
     */
    protected unref<THandle>(handle: THandle): THandle {
        const maybeUnrefable = handle as { unref?: () => void };
        if (typeof maybeUnrefable?.unref === 'function') {
            maybeUnrefable.unref();
        }
        return handle;
    }
}
