---
sidebar_position: 3
description: What each call costs against the plain JavaScript you would have written instead, read from the published price measurements.
---

import BenchPriceTable from '@site/src/components/Bench/BenchPriceTable';
import BenchPriceControls from '@site/src/components/Bench/BenchPriceControls';

# The price of a call

What does each call cost against the plain JavaScript you would have written
instead of it? `upsertEntity` against `map.set(id, entity)`. A one-column update
against `entity.title = value`.

Each table on this page is generated from the published price measurements
(`npm run price:publish` in `packages/bench`). No figure on the page is typed by
hand. A price measured against an older core than the one the site was built
from is marked **measured before the current core**: the reading holds for
what it measured, but it is not a price of the code documented here.

Nothing on this page compares OIMDB to another library. That is
[Benchmarks](/docs/benchmarks).

## How to read a price

- **Ours** is the call. **Floor** is what a person writes by hand for the same
  result. The ratio is ours over floor.
- **The caveat under each call** says what the two sides do differently. A
  floor is sometimes a single store that does a fraction of the work and
  sometimes a hand-written version that does most of it. Where both exist for
  one operation, the two prices bracket the cost, and neither alone is it.
- **The path a price sits on decides whether it matters.** A charge paid once at
  startup and a charge paid for every entity a write touches are not comparable. The tables below are grouped by path, from rarest to hottest.
- **A ratio inside the noise is not a reading.** Every run carries two controls,
  shown next. Read no ratio closer to 1.00 than the second control's distance
  from it.

## The instrument

The first control doubles the work on purpose and must read about 2×. The second
runs the same body under two names and must read 1.00. Together they say what the
run could resolve.

<BenchPriceControls />

## Per declaration

Paid once per application, screen or module: building a collection, an index,
the root.

<BenchPriceTable path="per declaration" />

## Per relationship

Paid once when a reader and a piece of data are joined: a mount, a subscription, a
resolve.

<BenchPriceTable path="per relationship" />

## Per frame

Paid once per frame, however many entities moved in it: the flush, delivering to
a subscriber, recomputing a derivation.

<BenchPriceTable path="per frame" />

## Per write

Paid once for each call that changes something.

<BenchPriceTable path="per write" />

## Per entity per write

Paid for every entity a write touches. This is the hottest path there is.

<BenchPriceTable path="per row per write" />

## Per read

Paid for every value a reader takes out.

<BenchPriceTable path="per read" />

## What these prices do not prove

They prove what the calls cost. They do not prove the calls are the fastest the
engine could have made them. That is a different measurement, against other
designs for the same work rather than against the primitive, and it reads the other
way up: below 1.00 the shipped design is cheaper. Those readings are on
[Shipped against the alternatives](/docs/performance/shipped-against-the-alternatives),
and the posts on the [blog](/blog) that describe them each say which shipped code
path they measured.
