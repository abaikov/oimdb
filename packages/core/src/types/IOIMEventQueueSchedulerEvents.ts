import { EOIMEventQueueSchedulerEventType } from '../enums/EOIMEventQueueSchedulerEventType';

/**
 * Events that can be emitted by the scheduler. */
export interface IOIMEventQueueSchedulerEvents extends Record<string, unknown> {
    [EOIMEventQueueSchedulerEventType.FLUSH]: void;
}
