import { OIMEventQueueScheduler } from '../../abstract/OIMEventQueueScheduler';

/**
 * Synchronous scheduler — flushes immediately, in the same call stack, on the
 * enqueue that triggers scheduling. It performs NO batching: every write that
 * schedules a flush is delivered right away.
 *
 * This is a DEBUG / diagnostic tool, not a production scheduler. Swap it in at
 * the root to strip all coalescing and test whether a suspected bug is caused by
 * batch timing: if the bug disappears under synchronous delivery it is
 * coalescing-related, if it persists it is not. It automates what manually
 * calling `queue.flush()` after every write would do.
 *
 * Caveats (all inherent to removing batching):
 * - subscribers observe intermediate, un-coalesced states the batched schedulers
 *   hide (e.g. a collection updated but its index not yet);
 * - a cyclic reactive graph that would loop across ticks under an async
 *   scheduler recurses here and can overflow the stack.
 */
export class OIMEventQueueSchedulerSync extends OIMEventQueueScheduler {
    schedule(): void {
        // Emit FLUSH synchronously → the queue drains now, in this call stack.
        this.flush();
    }

    cancel(): void {
        // Nothing is pending — the flush already ran synchronously in schedule().
    }
}
