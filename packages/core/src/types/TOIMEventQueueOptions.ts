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
};
