# `OIMReactiveCollection` — prose moved out of the source

Every block below stood in `OIMReactiveCollection.ts` and is reproduced verbatim, with the
declaration or statement it stood over. One block stayed in the source: "Carrier BEFORE
batch" in `upsertOneByPk`, which states the order the two calls under it must keep.

## Over `export class OIMReactiveCollection`

`TEmitter` is what decides how much this collection knows about its own writes.

The default is the plain keyed emitter and every existing usage keeps that,
unchanged. Passing `OIMCarrierKeyedFieldEmitter` instead gets a collection
whose subscribers can name the fields they care about.

The collection does not mirror its emitter's methods — subscribe through
`collection.emitter`. That is what makes the capability honest: the
emitter's type IS the type parameter, so `subscribeOnKeyFields` is present
exactly when a field emitter was installed and absent otherwise, decided by the
compiler. A forwarding method on the collection could not do that; it would
have to exist unconditionally and refuse at runtime, which is an error for
being built wrong rather than a design that cannot be built wrong.

Field tracking has two halves and both are opt-in. The slot writer
(`OIMSlotWriterFieldMasked`) RECORDS which fields a write touched and owns the
only field registry, reachable as `collection.fields`; the field emitter READS
that record to filter deliveries. Install the emitter without the writer and
there is nothing to read — masks are absent, which every field-scoped
subscriber reads as "everything changed", so it wakes on every write.

## Over `public readonly emitter: TEmitter`

Slot-based keyed delivery: handlers live on the entity slot, so marking
and notifying need no per-key map lookup on the hot path.

## Over `private readonly pendingAnyUpdatePks`

Only ever holds `slot.pk` (one canonical reference per logical key), so a
native `Set` dedups correctly by reference even for composite pks.

## Over the `createEmitter` option in the constructor

Build the keyed emitter this collection delivers through. Omit for
the plain one; supply `OIMCarrierKeyedFieldEmitter` to opt into
field-level tracking. The provider is handed in rather than built
by the caller so the slot store stays private.

## Over `private notifyBatch(pk)`

Two notification channels coexist on a reactive collection; they serve
different audiences and NEITHER is obsolete:
  • the keyed `emitter` — per-key/per-carrier pings ("did MY key
    change?", payload-less `void`), for leaf subscribers like React hooks
    that declare the keys they care about up front;
  • this `emitter` UPDATE event — the aggregate/batch channel that carries
    the full list of changed pks in one SYNCHRONOUS callback, for
    consumers that do NOT know their keys ahead of time and must re-derive
    over the batch: derived indexes/collections, changed-fields, persist,
    snapshot-manager. `pks` always enumerates exactly what changed — even
    clear() lists every removed key, so an empty array never occurs.
It is not a per-key emitter with fewer features — it is the opposite
shape (enumerated batch, not "my key"), which is why it stays.

Emit on the batch channel only when something is actually subscribed —
otherwise every upsert/remove allocates a throwaway `{ pks }` object (and
array) that nobody reads.

## Inside `upsertOneByPk`, over the `slot.published === false` return

A writer that compares values reports `false` when the write changed
nothing: no carrier marked, no batch event, no index resync. A plain
writer always reports `true`, so this path is unchanged for it.

## Inside `upsertMany`, over the `changed` array

Only the slots the writer actually published take part in the batch —
a push that rewrites 1,000 rows to the values they already held ends
up notifying nobody.

## Inside `clear`, at the top

clear() removes every present key. Capture those keys BEFORE clearing
so the batch + anyUpdate channels report exactly which keys changed —
an empty `pks` never means "reset", it means "nothing changed". Build
the key array only when a channel that needs it is subscribed.

## Inside `clear`, over `this.emitter.markAllUpdated()`

Keyed subscribers are notified across all subscribed carriers; this is
carrier-based and needs no pk list, so it works after the store clear.
