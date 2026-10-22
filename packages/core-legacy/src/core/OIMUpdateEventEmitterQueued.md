# `OIMUpdateEventEmitterQueued` — prose moved out of the source

The block below stood over `export class OIMUpdateEventEmitterQueued` in
`OIMUpdateEventEmitterQueued.ts` and is reproduced verbatim.

Delivers inside the next `queue.flush()`.

The default shape: a reaction to changed data, coalesced so a key wakes its
subscribers once per frame however many times it was written.

This is also the only emitter that refuses to be marked mid-frame, and the
reason is specific to it rather than a general rule: its delivery IS the frame,
so a mark arriving during one would either join a batch already being handed
out or silently slip into the next. Both are the kind of ordering bug that
shows up as a missing render three screens away. The emitters that deliver
after the frame, or immediately, have no such ambiguity and no such guard.
