import { OIMEventQueueScheduler } from '../../abstract/OIMEventQueueScheduler';
import { TOIMSchedulerType } from '../../types/TOIMSchedulerType';
import { TOIMSchedulerOptions } from '../../types/TOIMSchedulerOptions';
import { OIMEventQueueSchedulerMicrotask } from './OIMEventQueueSchedulerMicrotask';
import { OIMEventQueueSchedulerAnimationFrame } from './OIMEventQueueSchedulerAnimationFrame';
import { OIMEventQueueSchedulerTimeout } from './OIMEventQueueSchedulerTimeout';
import { OIMEventQueueSchedulerImmediate } from './OIMEventQueueSchedulerImmediate';

/**
 * Factory for creating event queue schedulers.
 * Provides a convenient way to create schedulers with type-safe configuration.
 */
export class OIMEventQueueSchedulerFactory {
    /**
     * Create a scheduler of the specified type with optional configuration.
     */
    static create<T extends TOIMSchedulerType>(
        type: T,
        ...args: TOIMSchedulerOptions[T] extends never
            ? []
            : [TOIMSchedulerOptions[T]]
    ): OIMEventQueueScheduler {
        switch (type) {
            case 'microtask':
                return new OIMEventQueueSchedulerMicrotask();

            case 'animationFrame':
                return new OIMEventQueueSchedulerAnimationFrame();

            case 'timeout': {
                const options = args[0] as
                    | TOIMSchedulerOptions['timeout']
                    | undefined;
                return new OIMEventQueueSchedulerTimeout(options?.delay);
            }

            case 'immediate':
                return new OIMEventQueueSchedulerImmediate();

            default:
                throw new Error(`Unknown scheduler type: ${type}`);
        }
    }

    /**
     * Create a microtask scheduler (most common for general use).
     */
    static createMicrotask(): OIMEventQueueSchedulerMicrotask {
        return new OIMEventQueueSchedulerMicrotask();
    }

    /**
     * Create an animation frame scheduler (ideal for UI updates).
     */
    static createAnimationFrame(): OIMEventQueueSchedulerAnimationFrame {
        return new OIMEventQueueSchedulerAnimationFrame();
    }

    /**
     * Create a timeout scheduler with optional delay.
     */
    static createTimeout(delay?: number): OIMEventQueueSchedulerTimeout {
        return new OIMEventQueueSchedulerTimeout(delay);
    }

    /**
     * Create an immediate scheduler (fastest execution).
     */
    static createImmediate(): OIMEventQueueSchedulerImmediate {
        return new OIMEventQueueSchedulerImmediate();
    }
}
