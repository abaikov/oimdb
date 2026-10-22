---
sidebar_position: 1
description: How OIMDB performance is measured with two harnesses and controls, why the machine is part of the number, and how to read a measurement artifact.
---

# How we measure

:::warning[The suite has not been run against the current engine]

Every artifact under `packages/bench/measurements/` predates the engine
documented under [`@oimdb/core`](/docs/core/model). So the pages in this section
describe a real suite that was run honestly. They are kept for the **method and the
evidence**, not as a price list for the code documented here.

Measurements against the current engine are collected cell by cell and published
under [Benchmarks](/docs/benchmarks), where every number carries its date, its
fingerprint and whether it is still fresh. No page in this section quotes them.

The method below is what that suite has to meet.

:::

Every performance figure on this site names a directory under
[`packages/bench/measurements/`](https://github.com/abaikov/oimdb/tree/master/packages/bench/measurements).
If a figure does not name one, treat it as a bug in these docs and open an issue.

That rule exists because this project already published a number that was not
real.

<InShort>

- Every performance figure names the measurement directory it came from.
- The controls come first, and they can void the report.
- The machine is part of the number.
- The page lists what is not claimed and how to read a measurement artifact.

</InShort>

## What the measurement work shows

The aim is to show that for every typical task some combination of shipped
strategies costs no more than the hand-written floor, on the same tasks every
framework in `packages/bench` is measured on. A ratio above 1.00 on the defaults
is therefore not a result until the alternative strategies are measured too. A
task that no strategy brings to the floor is reported with a decomposition of the
remaining gap.

## The number that wasn't

Two source files stated, as measured fact, that four subclasses of the collection
cost **+76%** on a 10k-row write path. It read like evidence. It shaped an
architectural argument. `git log -S"76%"` finds no script, no log and no commit
that produced it.

Nobody lied. A number was measured once, quoted, and outlived the thing that
produced it. By the time anyone read it, a claim dressed up as a measurement
was indistinguishable from a real one.

**The figure once offered against it made the same mistake while condemning it.**
It reported that a harness had re-measured the same comparison
at "+14%", with a control holding the population geometry still. That figure
names no directory either. There is no pair, no floor and no recorded run
for "one collection class against four subclasses" anywhere in `packages/bench`.
It has exactly the standing of the number it was offered to debunk, and it has
been removed rather than quietly kept because it happens to favour us.

So the honest state of that claim is: **`+76%` is unsupported, and so is every
figure offered against it so far.**

The standard here is therefore not "we ran a benchmark". It is this: **the artifact exists,
it names the machine, and it says what would have made it wrong.**

## Two questions, two harnesses

They answer different things and neither substitutes for the other.

| | question | command |
|---|---|---|
| **The price of a call** | What does each call OIMDB offers cost against the plain JavaScript you would have written instead? | `npm run price` |
| **The scenario benchmark** | Which library is faster at a whole screen, against fifteen others? | `npm run bench` |

The price table compares us against **the floor**, not against competitors. A
row is a price tag, not a ranking. It is the more honest of the two, because the
floor cannot be tuned in our favour: it is `map.set(id, row)`, it is
`row.title = value`.

There is a third harness, `npm run alternatives`, whose other side is neither a
primitive nor a competitor but another design for the same work: one that was
rejected, or a second shipped strategy. Its pairs are on
[Shipped against the alternatives](/docs/performance/shipped-against-the-alternatives).

## The controls come first, and they can void the report

Every report opens with two rows that are not prices.

**`control-resolution-2x`** runs two bodies of arithmetic where one deliberately
does twice the work of the other. The true ratio is a little *under* 2 — both
sides pay the driving loop once. If it reads below 1.5 the runner **voids the
whole report** and exits non-zero: a process that cannot resolve a doubling it
was told about has no business printing ratios.

**`control-scale-same-body`** runs the same body twice over its own copy of the
same state. The true ratio is 1.00 exactly, so whatever it prints instead was
produced by that machine at that moment — and that gap becomes the rule for the
whole table: **no ratio closer to 1.00 than the control's own error is a
reading.**

This is not ceremony. A full run of the scenario benchmark was once started on a
machine that an unrelated `npm install` had taken over, and its resolution control failed to
resolve the doubling it was told about. The control did its job, but an hour after
the machine's own state had said the same thing for free.

## The machine is part of the number

Every row carries the one-minute load average read before and after it. A pair
whose foreign load exceeds the gate is **refused rather than measured**, and the
refusal is recorded.

The first recorded run of the price harness measured some of the pairs it was
asked for and refused the rest: the write path went through at a low foreign load,
a background process then pushed the average past the gate, and everything after
that point was refused rather than measured. A harness that measures anyway, and
lets you find out an hour later, is worse than one that stops.

> **Counts for that run are struck — "asked for 32 pairs and measured **10**
> … the remaining 20 were refused", with a foreign load of **1.52** rising to
> **3.84**.** Those figures do not add up (10 + 20 ≠ 32) and no artifact under
> `packages/bench/measurements/2026-08-20-price/` records a refusal: the six
> pieces there hold 42 records between them and no refusal log. So the counts
> have been struck. By this page's own rule they never should have been printed
> without a directory beside them; that they survived here is the same failure
> the section above it is about. Restoring them needs the run's own artifact.

The gate takes a **number**, never a "yes" — `BENCH_MAX_LOAD=2.5`. Whoever raises
it has to say what they accept, and the number they accepted is written into
`machine.json` and printed under every table produced under it.

## What we do not claim

The [price tables](./the-price-of-a-call.md) print every pair the catalogue
measures, including the ones far above the floor, and each carries its caveat.
A price measured against an older core is marked as such.

A benchmark containing only shapes we win is not evidence of speed. It is
evidence of cherry-picked scenarios. Two scenario rows were added specifically because
they are expected to count against us: a consumer per group, and delivery
targeted at a single column. A price nobody can see is a price nobody believes.

## Reading an artifact

```
packages/bench/measurements/2026-08-20-price/write/
    machine.json    CPU, cores, Node build, and the load gate in force
    records.json    every field the worker produced, unrounded
    report.txt      the run as the terminal printed it, controls first
```

Each **piece** is self-contained: it re-measures both controls and carries its
own load readings, so it can be disputed and re-run without any other piece being
present. Nothing is merged, and no row is ever averaged with a row measured at
another moment.
