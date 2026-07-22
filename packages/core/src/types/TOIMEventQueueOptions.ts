import { OIMEventQueueScheduler } from '../abstract/OIMEventQueueScheduler';

/**
 * Configuration options for event queue initialization.
 */
export type TOIMEventQueueOptions = {
    /**
     * Optional scheduler for automatic queue flushing.
     * If provided, the queue will automatically schedule flush operations when items are enqueued.
     * If not provided, flush() must be called manually.
     */
    scheduler?: OIMEventQueueScheduler;

    /**
     * Handler for an error thrown by a task during flush. When set, the queue
     * treats the error as handled — it is NOT re-raised out of `flush()`. When
     * NOT set, the error propagates (loud by default: uncaught in async/scheduled
     * mode, thrown to the caller of a manual `flush()`).
     *
     * Either way the queue's own state is always restored (one failing task never
     * wedges the queue) and a `FLUSH_ERROR` event is emitted for tooling.
     */
    onError?: (error: unknown) => void;
};
