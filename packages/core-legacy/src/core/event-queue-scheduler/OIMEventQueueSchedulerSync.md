# The synchronous scheduler is a diagnostic

It flushes immediately, in the same call stack, on the enqueue that triggers
scheduling, and batches nothing: every write that schedules a flush is delivered
right away. Swapping it in at the root strips all coalescing and answers one
question — if a suspected bug disappears under synchronous delivery it is
coalescing-related, if it persists it is not. It automates what calling
`queue.flush()` after every write would do by hand.

Both hazards are inherent to removing batching:

- subscribers observe intermediate, un-coalesced states that the batched
  schedulers hide (a collection updated but its index not yet);
- a cyclic reactive graph that would loop across ticks under an async scheduler
  recurses here instead, and can overflow the stack.
