import { OIMUpdateEventCoalescer } from '../core/OIMUpdateEventCoalescer';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { TOIMPk } from './TOIMPk';

/**
 * Options for creating an update event emitter */
export type TOIMUpdateEventEmitterOptions<TKey extends TOIMPk> = {
    coalescer: OIMUpdateEventCoalescer<TKey>;
    queue: OIMEventQueue;
};
