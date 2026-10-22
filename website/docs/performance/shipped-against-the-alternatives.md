---
sidebar_position: 4
description: Each shipped design measured against an alternative design for the same work, read from the published alternatives catalogue.
---

import BenchAlternativeTable from '@site/src/components/Bench/BenchAlternativeTable';
import BenchPriceControls from '@site/src/components/Bench/BenchPriceControls';

# Shipped against the alternatives

[The price of a call](/docs/performance/the-price-of-a-call) says what a call costs
against the plain JavaScript you would write instead. This page asks a different
question: for each design the engine ships, how does it compare with another
design for the same work? Most alternatives are designs that were rejected;
some are a second shipped strategy for the same job. Each pair runs both sides on
the same work.

Every figure here is generated from the published measurements
(`npm run price:publish` in `packages/bench`). No figure is typed by hand.

## How to read a pair

- **Shipped** is the design in the engine. **Alternative** is the other design. The
  ratio is shipped over alternative, so it reads the other way up from a price:
  below 1.00 the shipped design is cheaper, above 1.00 the alternative is.
- **A ratio close to 1.00 decides nothing.** The alternative is timed twice in the
  pair's process, before and after the shipped side, and each card prints how far
  apart those two timings came out. The shipped side is timed a second time in its
  own process, and that gap is not published yet, so the printed gap covers only
  part of the ratio's error. The controls below show what the run as a whole could
  resolve.
- **An alternative that comes out cheaper is a finding.** For that task it is either
  a strategy the engine is missing or a trade-off the caveat names; see
  [Performance](/docs/guides/performance).
- **The caveat under each pair** says what the two sides do differently, so a pair
  is never read as more than it measured.

## The instrument

<BenchPriceControls />

## Per relationship

<BenchAlternativeTable path="per relationship" />

## Per frame

<BenchAlternativeTable path="per frame" />

## Per write

<BenchAlternativeTable path="per write" />

## Per entity per write

<BenchAlternativeTable path="per row per write" />

## Per read

<BenchAlternativeTable path="per read" />
