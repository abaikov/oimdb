import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMComputeRuntime } from '../modules/compute/core/OIMComputeRuntime';
import { oimComputeRuntimeByQueue } from './oimComputeRuntimeByQueue';

/**
 * The runtime already attached to `queue`, or `undefined` — WITHOUT creating one.
 *
 * The read-only counterpart of `getOIMComputeRuntime`, for code that must not
 * change what it observes: devtools asking "does this queue even have a compute
 * graph", teardown checking whether there is anything to destroy, assertions in
 * tests. A runtime that has been destroyed reads as `undefined`, matching what
 * `getOIMComputeRuntime` would then replace — so a caller cannot get hold of a
 * detached runtime through this door either.
 */
export function peekOIMComputeRuntime(
    queue: OIMEventQueue
): OIMComputeRuntime | undefined {
    const runtime = oimComputeRuntimeByQueue.get(queue);
    return runtime === undefined || runtime.isDestroyed ? undefined : runtime;
}
