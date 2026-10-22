---
sidebar_position: 5
description: Why mixing several strategies of one kind in one app can make the engine's shared call sites polymorphic or megamorphic, and how many is too many.
---

import BenchPrice from '@site/src/components/Bench/BenchPrice';

# Mixing strategies in one app

Every fork in the engine ships as several strategies, picked at construction, so
no single strategy pays a branch on the hot path. That holds while an app uses
one strategy per kind. Mix several strategies of the same kind in one process
and the engine's shared code starts seeing all of them at once.

## What a shared call site sees

V8 speeds up a property read or a method call by remembering what it saw there
before: the hidden class of the object, or the function it called. That memory
is per call site, not per collection. Two collections built with different
strategies still run the same engine code, so a site inside the engine sees
both strategies.

- **One hidden class at the site** is monomorphic: the fastest case.
- **Two to four** is polymorphic. V8 still caches every one of them and can
  still inline the call. Four is V8's own limit: `node --v8-options` lists
  `--max-valid-polymorphic-map-count` with a default of 4.
- **Five or more** is megamorphic. V8 drops the site's own cache, looks each
  call up in one cache shared by the whole process, and stops inlining through
  the site.

The cost lands on every collection that passes through the site, including the
ones that use only one strategy.

## Which strategies count

A strategy counts when it is an object or a function the engine calls from code
shared with the other strategies of its kind:

- slot release policies, the `IOIMSlotReleasePolicy` strategies;
- set-driven and array-driven buckets and indexes;
- entity writers, `createOIMEntityWriterInPlace` and
  `createOIMEntityWriterReplacing`, and entity insert strategies,
  `TOIMEntityInsertStrategy`;
- the `sameValueGuard` of a computed (`TOIMSameValueGuard`);
- slot emptiness checks, `IOIMSlotEmptiness`;
- channel schedulers, `TOIMChannelScheduler`.

## What to do

Use one strategy per kind per app unless a task really needs two. Two or three
strategies of one kind keep a site polymorphic, and that is fine. Five different
release policies in one process is not.

## What has been measured

One pair measures the polymorphic side of this, on the slot write. A single
write function handed the three shipped slot shapes, against the same function
handed three slots minted with one unified shape:
<BenchPrice id="alt.slot-shape.three-shapes-against-one-at-the-write" />.
Three shapes at one site cost about the same as one. That pair is why up to four
strategies of a kind is fine. Its date and how far apart its two timings came out
are on its card in
[Shipped against the alternatives](/docs/performance/shipped-against-the-alternatives).

No pair yet measures a site with five or more shapes, so the megamorphic side of
this page rests on V8's documented behaviour, not on a figure from this engine.

## Where to next

<DocCards>
<DocCard to="/docs/guides/performance" title="Performance">Choosing a strategy for each fork.</DocCard>
<DocCard to="/docs/performance/shipped-against-the-alternatives" title="Shipped against the alternatives">Each shipped design against another design for the same work.</DocCard>
</DocCards>
