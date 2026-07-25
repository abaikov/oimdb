import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMComputeRuntime } from '../modules/compute/core/OIMComputeRuntime';

/**
 * Queue → its one compute runtime.
 *
 * INTERNAL — deliberately not re-exported from the package entry point. Reach it
 * through `getOIMComputeRuntime` / `peekOIMComputeRuntime` / `setOIMComputeRuntime`
 * so the "one runtime per queue" invariant stays enforced in one place.
 *
 * This is a lookup table, not a singleton: no runtime instance lives at module
 * scope, and two queues get two independent runtimes. Weak by key, so an entry
 * dies with the queue it belongs to — nothing to reset between tests.
 */
export const oimComputeRuntimeByQueue = new WeakMap<
    OIMEventQueue,
    OIMComputeRuntime
>();
