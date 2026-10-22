# `TOIMCollectionKit` — prose moved out of the source

Every block below stood in `TOIMCollectionKit.ts` and is reproduced verbatim, with the
member it stood over.

## Over `on`

Dependency builders for `computed` / `effect` (no manual wrapper classes).

## Over `computed`

Create a computed on the queue's shared runtime and add it to `scope`.
Deps come from `on.*` and may reference any source sharing the queue.

## Over `effect`

Create an effect on the queue's shared runtime and add it to `scope`.

## Over `scope`

Dispose scope owning the kit's collection. `add()` indexes/streams/
subscriptions you create off the kit, then `destroy()` tears them all down
in reverse order. Does NOT own the `queue` (it is passed in and may be
shared) — destroy the queue yourself when nothing else uses it.

## Over `destroy`

Tear down the kit's scope (collection + everything added to it).
