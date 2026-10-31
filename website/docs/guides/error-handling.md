---
sidebar_position: 3
description: What happens when code throws during a frame under each error policy, and which construction, write and teardown failures are refused at the call.
---

# Error handling

What happens when something throws during a frame, and which failures are not
frame errors at all but refusals thrown at the call.

<InShort>

- An error with no synchronous caller to throw to goes to the error policy: digest and log, or throw at once.
- Errors from derivations have their own handling.
- Refusals are thrown at the call, at construction, at write time and at teardown.
- A comparator that throws is covered too.

</InShort>

```ts setup
import { OIMDB, OIMEffectService, OIMLogAndContinueErrorPolicy, OIMThrowAtOnceErrorPolicy, OIMSlotAfterIdleReleasePolicy, type IOIMErrorPolicy, createOIMEntityContentService, createOIMSlotCollectionService, OIMDefaults } from '@oimdb/core';

type Card = { id: string; title: string };

declare function reportToSentry(error: unknown): void;

const db = new OIMDB();
const effectService = OIMEffectService.INSTANCE;
const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>() });
const cards = cardService.createStoreSlot(db);
```

## The error policy: digest and log, or throw at once

Every error that has no synchronous caller to throw to is caught: effect bodies and their
cleanups, `onBeforeFlush`, after-each-frame and after-each-flush handlers, the
unused-slot sweep at the end of a flush, and a release collector's own timer
tick. What a throw then does is the **error policy**, chosen once at
construction. A call that does have a caller, such as a write or a hand-called
release collector `flush`, throws to that caller instead.

**The default digests and logs.** `OIMLogAndContinueErrorPolicy` writes each throw
to `console.error`, hands it to the optional `onError`, and the flush goes on:
every other effect and handler still runs. That `onError` is where an error
tracker plugs in. An effect stamps `ranAtRevision` / `ranAtEpoch` only after its
body returns, so a body that threw is not stamped and takes the same change again
at its next wake.

```typescript
const reportingDb = new OIMDB({
    errorPolicy: new OIMLogAndContinueErrorPolicy({ onError: (error) => reportToSentry(error) }),
});
```

```typescript
const slot = cardService.getSlotByKey(cards, 'c1');
effectService.createEffect(db, () => { throw new Error('bad effect'); }, [slot]);
effectService.createEffect(db, () => { console.log('still runs'); }, [slot]);

cardService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'x' });
db.flush();   // logs the error, logs "still runs", returns
```

**Or it fails on the first throw.** `OIMThrowAtOnceErrorPolicy` throws the first
error out of `flush()` the moment it happens. The effects the frame had not
reached yet stay queued and run at the next `flush()`. This is the mode for tests
and development, where a bug should stop the run at the line that caused it.

```typescript
const strictDb = new OIMDB({ errorPolicy: new OIMThrowAtOnceErrorPolicy() });
```

**Or your own.** A policy is anything with `onErrorCaught(error: unknown): void`,
that is, `IOIMErrorPolicy`. Whatever `onErrorCaught` does is what a throw does: if it returns, the
flush goes on; if it throws, the flush stops there, exactly as under
`OIMThrowAtOnceErrorPolicy`. A test that wants every error of a frame, not only
the first, collects them:

```typescript
class ErrorPolicyCollecting implements IOIMErrorPolicy {
    public readonly errors: unknown[] = [];
    public onErrorCaught(error: unknown): void { this.errors.push(error); }
}

const collecting = new ErrorPolicyCollecting();
const testDb = new OIMDB({ errorPolicy: collecting });
```

**Why a policy chosen at construction, not a flag or a per-call option.** Each of the two
arms is right for someone. Production wants one broken subscriber not to
stop the rest, and a test wants the run to stop at the line that broke. So both ship
and the db is built with one. The flush loop then calls
`errorPolicy.onErrorCaught(error)` and never asks which mode it is in. When no
`errorPolicy` is passed, the db is built with `OIMLogAndContinueErrorPolicy.INSTANCE`.

**One policy for the whole database.** `new OIMDB({ errorPolicy })` hands the same policy to the channel slot
and to every release collector of that db, so every error lands in one place:

```typescript
const oneSinkDb = new OIMDB({ errorPolicy: new OIMThrowAtOnceErrorPolicy() });
const idleReleasingDefaults = new OIMDefaults({
    slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 30_000 }),
});
```

A release collector's tick has no caller, so even under `OIMThrowAtOnceErrorPolicy`
its throw goes to the timer's context, just as a scheduled `flush()` does below.

In both modes **the frame always finishes cleanly**: the frame is marked done
and its opening clock is set to now in a `finally`, so the *next* `flush()` behaves
normally. A throw never leaves the runtime mid-frame.

A `subscribeOnceAfterFrame` handler comes off **before** its body runs, so one
that throws is not left standing for the next frame.

If `flush()` runs from a `channelScheduler` callback, `OIMThrowAtOnceErrorPolicy`
has no synchronous caller to throw to, so the throw becomes an uncaught exception in
whatever context the scheduler runs in.

**Code that keeps derived state is outside the policy.** An index's `keyOf` and
an emptiness check maintain what other reads depend on; letting the
operation carry on past them would leave an index that disagrees with its source.
A throw there is thrown at the call in either mode. **No write is rolled back:** the slot is filed
first and the index is told after, so when an index throws, the write stays and the throw reaches the
caller. The indexes that ran before the one that threw have already moved the entity, and it stays that
way until the entity is written again. The same holds for a batch: the writes that landed stay, and the
throw leaves `closeBatch`.

## Errors from derivations

A derivation is **asked, not woken**. `derive()` runs before its stamps move, so
a body that throws leaves the computed exactly as it was and the next read tries
again. The throw travels to whoever asked — usually the effect that was settling
it on its way to deciding whether to run — and goes to the error policy like any
other effect error.

## Refusals: thrown at the call

These throw out of the call you made, and nothing is deferred, with one
exception, named under the first of them: a refusal raised from a handler the
frame itself is running goes to the error policy like any other handler throw.

### A write during a flush

```
OIMChannelService: writes are refused for the whole of a flush — onBeforeFlush and every
after-each-frame handler included, not only the frame body. Write after flush()
returns.
```

A subscriber is told *during* the frame, on a half-built world: the graph has not
advanced, the indexes have not settled, and the delivery list has already been
taken. `onBeforeFlush` and the after-each-frame tail are inside the same flush,
so neither is a door for a write. To write in response to a change, write after
`flush()` has returned.

A refusal raised from a tail handler is the one case where this error does *not*
reach the caller at the call: it goes to the error policy like any other handler
throw (logged by default, thrown out of `flush()` under
`OIMThrowAtOnceErrorPolicy`) rather than out of the `writeSlotContentByKey` that made it.

The same refusal comes from every write door, for an entity in a store slot, a single entity and
a bucket alike, and from `disposeIndexStoreSlot`. A write to a released identity throws too.

**A refused write does not leave a filed, valueless slot behind.** When `writeSlotContentByKey` or
`writeSlotContentByKey` minted an identity for the write and the write throws, the new identity is
released again before the throw leaves the call, unless something already holds it.

**Refused is not the same as unchanged**, and only one of them unwinds anything:

| | What happened | What the caller gets |
|---|---|---|
| **Refused** | The write threw; no content ever arrived | The throw. That identity is unwound — nothing is filed |
| **Unchanged** | The write *did* happen and the content was already there | The identity, like any other write. Nothing is unwound |

`writeSlotContentByKey` is total: it always hands back the identity it resolved or minted,
whatever the write said about the content. Whether an identity nothing keeps is
worth keeping is the owner's question, asked through `releaseSlotIfUnheld`.

When a computed slot is minted, a `createSources` that throws leaves nothing held. A source that
cannot be held, for example one already released, throws part-way through, and the holds already
taken on the sources before it are never given back. Keep `createSources` total, and pass only
sources that are alive.

### `flush()` during a frame

```
OIMChannelService.flush: a frame is already running, and a second one inside it would end the first. …
```

A frame inside a frame would close the outer one while it is still delivering.

From the **tail** of a flush (`onBeforeFlush`, an after-each-frame handler, or
anything either of them called), `flush()` does not throw and does not defer: it
returns having done nothing. One flush spends exactly one frame however many
handlers ask for another.

## Construction-time refusals

- **A mismatched bucket content service and bucket storage.** That one is the
  compiler's: a bucket's own type says which storage it carries
  (`TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<Card>>>`), so handing a set-driven bucket to
  the array-driven content service does not compile.
- **A sort column the entity does not have.** Also the compiler's:
  `TOIMSortColumn<TEntity>` names only the entity's own string, number or bigint
  columns.

Every store slot takes its channel slot at `createStoreSlot(db)` and delivers through that one channel. A
bucket content service holds no per-bucket state (the bucket does), so sharing one
instance between bucket collections is allowed.

## Write-time refusals

- **There is no `writeSlotContent` / `clearSlotContent` on an index.** An index files entities
  automatically on write, using its `keyOf`; its `slotContentService` is typed to the reads only. If you need
  manual control over a bucket's slots, use a bucket collection (`createOIMSlotCollectionService`) instead.

Handing a bucket the slots it already has is **not** a change and is not
refused: the content service is asked, and an identical list returns without evicting
anything. That is what re-applying an unchanged server page does.

## A comparator that throws

**Thrown at the reader that asked.** A bucket never sorts, so its own reads never
run a comparator. A sorted list is a computed
(`createOIMSortedComputedService`), and its comparator runs inside that computed's
derive, so a throw leaves `getValueForSlot` for the reader that asked. It is
derived state, so it is not under the error policy.

The refresh of a computed slot stamps the run only after `derive` returns, so a derive that
threw is not recorded as run: the next read runs the comparator again. The value
it held before stays, and the bucket under it is untouched.

## Teardown-time refusals

There are none. A disposer is a `TOIMDisposer` (what `subscribeAfterEachFrame` and `subscribeEffect`
return) or `effectService.disposeEffect(effect)`, which is safe to call twice. Keeping them is
up to you. A bucket's own lifetime is answered by `releaseSlotIfUnheld`, through its
holds, its slots and its effects.

## Summary

| Question | Answer |
|---|---|
| Do other effects run if one throws? | By default yes — `OIMLogAndContinueErrorPolicy` logs it, calls `onError`, and goes on. |
| Can I make it stop at the first error? | Yes — `OIMThrowAtOnceErrorPolicy`; effects not yet reached run at the next flush. |
| Can the runtime get stuck mid-frame? | No — frame state is restored in a `finally`. |
| A throwing `keyOf` or emptiness check? | Derived state: thrown at the call in either mode. |
| Writing, or flushing, during a frame? | Throws at the call — a refusal, not a collected error. |
| A throwing comparator? | Thrown out of the sorted computed's `getValueForSlot`; the bucket is untouched and the next read runs it again. |
| Can I route errors somewhere of my own? | Yes — `onError` on the default policy, or your own `IOIMErrorPolicy`. |
