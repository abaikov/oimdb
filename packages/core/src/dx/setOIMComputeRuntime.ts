import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMComputeRuntime } from '../modules/compute/core/OIMComputeRuntime';
import { oimComputeRuntimeByQueue } from './oimComputeRuntimeByQueue';

/**
 * Install `runtime` as the one runtime for `queue`, replacing whatever was there.
 *
 * The injection seam for a subclassed runtime — an instrumented one that records
 * levels and drain order, a profiling one, a test double. Call it BEFORE anything
 * touches the queue's compute graph: nodes capture their runtime at construction,
 * so swapping afterwards leaves the existing ones on the old instance and splits
 * the dependency graph in two, which is exactly the glitch the one-runtime-per-
 * queue rule exists to prevent.
 *
 * `runtime.queue` must be `queue` — a runtime drains on its own queue's
 * AFTER_FLUSH, so a mismatched pair would never run.
 *
 * Replacing does NOT destroy the previous runtime: whoever installs a replacement
 * decides whether the old one still has live nodes on it.
 */
export function setOIMComputeRuntime(
    queue: OIMEventQueue,
    runtime: OIMComputeRuntime
): void {
    if (runtime.queue !== queue) {
        throw new Error(
            'setOIMComputeRuntime: the runtime is attached to a different queue. ' +
                'A runtime drains on its own queue and would never run here.'
        );
    }
    oimComputeRuntimeByQueue.set(queue, runtime);
}
