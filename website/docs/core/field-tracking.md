---
sidebar_position: 5
---

# Field-level change tracking

By default a collection tracks change at the granularity of an **entity**. Any write to `u1` marks `u1` dirty, and everyone subscribed to `u1` is woken. This is the right default: it costs one flag per written slot, and it is never wrong.

It is coarse, though, and the cost lands where entities are wide and subscribers are narrow. A `User` with fifteen fields, a sidebar that renders only `avatarUrl`, and a `lastSeenAt` refreshed by a heartbeat every few seconds: the sidebar re-renders on every heartbeat, for a field it never reads. The store cannot know that, because it never recorded which field the write touched.

Field tracking is the opt-in that makes it know. It is a **write-side** decision — a different slot writer — and it changes what the store can tell you afterwards.

## Turning it on

```ts
import {
    OIMReactiveCollection,
    OIMSlotWriterFieldMasked,
    createMergeEntityUpdater,
} from '@oimdb/core';

const users = new OIMReactiveCollection<User, string>(queue, {
    selectPk: u => u.id,
    slotWriter: new OIMSlotWriterFieldMasked<User, string>(
        queue,
        createMergeEntityUpdater<User>(),
    ),
});
```

Nothing else in the API changes. The same `upsertOneByPk`, the same subscriptions, the same indexes.

## What the store learns

**A write that changes nothing is not published.** The writer compares each field in the patch against the current value. If every one of them already held that value, no subscriber is woken and no index is touched — the write is a no-op, which is what it factually was. This alone removes a whole class of accidental wakeups: re-applying a server payload that is identical to what you already have, or writing a value back through a controlled input.

**A field that changes and changes back within one frame ends the frame unchanged.** The writer keeps the entity as it stood at the frame's first write and compares against *that*, not against the previous write. Set `name` to `'X'` and back to `'Alice'` before the flush, and `name`'s bit is clear when the frame is delivered. (The entity subscriber is still woken for that frame — the slot did enter the batch — but everything reading the change record sees, correctly, that `name` did not move.)

**Indexes can declare what they depend on.** A derived index reads entity fields to compute its key. If it declares which ones, it can be skipped entirely when a write touched none of them:

```ts
const byTeam = indexFactory.derivedSetIndex<string>(u => u.teamId, {
    deps: ['teamId'],
});
```

The heartbeat writing `lastSeenAt` now costs the index nothing: no key selector call, no membership diff, no bucket notification. Without `deps` the index has no licence to skip and behaves exactly as before — the declaration is what makes the optimisation safe, so it is explicit.

`deps` on a collection without field tracking throws at construction rather than being quietly ignored. A declaration that cannot be honoured is a bug in the calling code, and the failure mode of ignoring it — an index that silently costs what you thought you had removed — is invisible.

**The change record is readable during the frame.** Fields are identified by bit, and the collection exposes the registry:

```ts
const nameMask = users.fields!.maskOf(['name', 'avatarUrl']);
const slot = users.getSlotByPk('u1')!;

users.subscribeOnKey('u1', () => {
    if (((slot.dirtyFields ?? -1) & nameMask) === 0) return; // nothing I render
    rerenderSidebar();
});
```

`dirtyFields` is meaningful **only while the slot is dirty**, which is exactly the duration of the frame that delivered it. Read it inside the notification. Outside the frame it is not cleared, it is *stale*: the flag `slot.dirty` goes false when the frame ends, and the mask itself is overwritten by the first write of the next frame. A read taken later returns the previous frame's mask and looks perfectly valid — so gate on `slot.dirty`, or simply do not keep the value past the callback.

## What it costs

Per write: one comparison per field present in the patch, against the frame's base entity. Per slot that goes dirty in a frame: one integer mask and one reference to the base entity. Nothing is allocated per notification — the mask lives on the slot the write already touched.

So the trade is a **comparison on every write** against **the wakeups, index work and renders that comparison lets you skip**. It pays where writes are frequent and narrow relative to what subscribers care about — heartbeats, presence, partial server payloads, a sorted list keyed on one field of a wide entity. It does not pay where every write already matters to everyone reading, and there the plain writer is strictly cheaper.

## The two constraints

**A merging updater is required.** Field tracking compares the new value against the entity as it stood at the start of the frame, and it holds that entity by reference — it never copies. An in-place updater mutates that same object, so by the time the comparison runs, the base *is* the new value and every field looks unchanged. The result would not be a slower store, it would be a silent one.

`OIMSlotWriterFieldMasked` therefore rejects an in-place updater at construction, with that reason in the message, rather than letting it fail invisibly at runtime. Use `createMergeEntityUpdater()` (or any updater returning a new object). The in-place updater remains fully supported on the default writer, where nothing compares anything.

**Thirty-two fields.** A mask is a 32-bit integer, so the first 32 distinct fields written to a collection each get a bit. Beyond that the registry *saturates*: further fields report "all fields changed". Nothing breaks and nothing is lost — a saturated collection simply degrades to entity granularity, which is the default behaviour. `registry.isSaturated` reports whether it happened.

Thirty-two is a deliberate ceiling rather than a growable structure. A wider mask means an array or a bigint on the write path, allocation on the hot path, and a slower comparison for every collection — paid by everyone to serve entities wide enough that field granularity has already stopped being the interesting question.
