# `OIMIndexComparatorFactory` — prose moved out of the source

Every block below stood in `OIMIndexComparatorFactory.ts` and is reproduced verbatim, with
the declaration it stood over.

## Over `export class OIMIndexComparatorFactory`

Factory for creating index comparators.
Provides common comparison strategies for primary key arrays.

## Over `static createElementWiseComparator()`

Create an element-wise comparator that checks arrays for strict equality.
Compares array lengths and each element using strict equality (===).

## Over `static createSetBasedComparator()`

Create a set-based comparator that checks if arrays contain the same elements.
Order doesn't matter, only the presence of elements.

## Over `static createShallowComparator()`

Create a shallow comparator that only checks array references.
Fastest but only works if you're reusing the same array instances.

## Over `static createAlwaysUpdateComparator()`

Create a no-comparison comparator that always returns false (always updates).
Useful for disabling comparison while keeping the same interface.

## Inside the comparator bodies

Seven step labels stood over the statements they named — "Quick length check" (twice),
"Element-wise comparison using strict equality", "Convert to sets for comparison", "Check if
sets have same size (no duplicates issue)", "Check if all elements from existing set are in
new set / Iterate directly over Set instead of converting to array" — plus two trailing
`return true; // Arrays are equal` / `// Sets contain same elements`. Each named the line
under it; they are recorded here as having existed and are not reproduced as sections.
