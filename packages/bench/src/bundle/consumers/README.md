# Bundle consumers

## fieldFloor

### What the field-floor consumer is

A bucket the caller fills and reads, and one entity watched whole through
`effectService.createEffect` over its slot, never over a column slot. No column
identity is minted for any entity.

## groupingOneOrderOption

### What is and is not pinned without a bundler

`packages/core/tests/what-an-import-retains.test.ts` still names
`facade/bucket/OIMSlotContentBucketServiceArrayDriven.ts` in `a collection alone does not retain %s`,
so "no consumer gets the array-driven service merely by holding a population" holds. Its
`the service is an argument, not an option` case reads
`facade/bucket/OIMSlotContentBucketService.ts` and not a caller's own program, so the half about
the caller who builds an index is NOT pinned.

## withOrderedList

### The ordered-list diff, which is the whole of this arm

`packages/core/tests/what-an-import-retains.test.ts` attributes
+655 B gzipped / +1 607 B minified to naming this a free function rather than a
method, citing `packages/bench/measurements/2026-08-21-bundle/ordered-list/`.
That artifact was recorded over `createOrderedCommands`, which pinned the
observable machinery as well as the diff; this arm pins the diff alone. The two
are NOT the same measurement, and the next run of this pair is the first reading
of the smaller one.
