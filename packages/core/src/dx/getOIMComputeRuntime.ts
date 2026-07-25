import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMComputeRuntime } from '../modules/compute/core/OIMComputeRuntime';
import { oimComputeRuntimeByQueue } from './oimComputeRuntimeByQueue';

/**
 * The ONE compute runtime for a queue. Every computed / effect / selector that
 * shares a queue must share a runtime — they form one dependency graph, and
 * levels + scheduling live per-runtime. Created lazily on first use and cached
 * (per queue, garbage-collected with it), so cross-collection computeds all
 * schedule on the same topological pass.
 *
 * A runtime that was destroyed is replaced rather than handed back: it is
 * detached from the queue and would never drain again.
 *
 * See `peekOIMComputeRuntime` to read without creating, and
 * `setOIMComputeRuntime` to install your own.
 */
export function getOIMComputeRuntime(queue: OIMEventQueue): OIMComputeRuntime {
    const runtime = oimComputeRuntimeByQueue.get(queue);
    if (runtime !== undefined && !runtime.isDestroyed) return runtime;

    const nextRuntime = new OIMComputeRuntime(queue);
    oimComputeRuntimeByQueue.set(queue, nextRuntime);
    return nextRuntime;
}
