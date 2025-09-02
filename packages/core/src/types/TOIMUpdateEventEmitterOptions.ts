import { OIMUpdateEventCoalescer } from '../core/OIMUpdateEventCoalescer';
import { OIMEventQueue } from '../core/OIMEventQueue';

/**
 * Options for creating an update event emitter */
export type TOIMUpdateEventEmitterOptions<TKey> = {
    coalescer: OIMUpdateEventCoalescer<TKey>;
    queue: OIMEventQueue;
};
