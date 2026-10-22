# What a subframe is for

JavaScript here is synchronous, so a subframe guards nothing against another
thread. It does three jobs, and each is about code that runs inside a write:

1. **A frame cannot close half-way through a write.** A write's listeners (an
   index, a bucket) and a timer that fires synchronously run inside the write.
   While a subframe is open, `flush` refuses and `requestFlush` only records that
   a frame is owed; the outermost `closeSubframe` asks for it. Without the
   subframe, a flush could run after the entity slot was written and before its
   column slots were.
2. **Listeners hear a batch once.** `OIMSlotAggregate` holds the content changes
   of an open subframe and hands them over as one `onContentChangedMany`.
3. **Buckets settle once.** A bucket asks `runOnceOnSubframeClose` to recompute
   the bucket slots it changed when the outermost subframe closes.

**A door that makes exactly one channel write needs none of the three.** One
write cannot be seen half-done, and there is nothing to batch.
`OIMEntityCollection.updateEntity` and `updateEntityColumn` open no subframe when
nothing listens to the collection's content, no column of the slot is read, and
the collection does not recompute emptiness on a column write (it would do that
after the write). `OIMSingleEntity`'s `update`, `updateColumn` and `replace` open
none when no column of it is read: it recomputes emptiness before its one write,
which only sets a flag. Its `deleteColumns` always names the columns it took, so
it keeps its subframe. Both rules are pinned by
`facade/entity/tests/how-many-subframes-a-door-opens.test.ts`.

**Without a timer, `requestFlush` is not called at all.** It would only record
an owed frame that nothing is going to run; the timer is fixed at construction.
