# Bundle harness

## bundleControls

### The two ways this instrument can be silently broken

Both produce a well-formatted table and a defensible-looking answer. Tree-shaking
off collapses every difference toward zero, so the report says the ordered-list
diff costs nothing; minification off inflates every count by comments, so it says
the diff costs many kilobytes. The controls are aimed one in each direction.

The thresholds are deliberately slack: far from any plausible honest reading and
just tight enough to catch the flag being off, because a control that fails when
the engine is refactored is a control people learn to ignore. The failure being
caught reads 1.00, and no threshold between 0.6 and 1.0 catches anything 0.6 does
not.

### Which baseline a grouping row measures from

It is the whole difference between the three claims: from `grouping-none`, what
the LAYER costs a consumer who never groups; from `grouping-one`, what the module
split and the constructed bucket service save a consumer who groups once. A row
on the wrong baseline would still produce a difference, still print a caveat, and
still be about nothing anybody argued over.

## exciseSource

### What a brace scanner can and cannot get wrong

It cannot be subtly wrong, only loudly wrong: every rule asserts an occurrence
count, and a scanner that ran off the end of a declaration takes the rest of the
file with it, so esbuild fails to parse.

Comments and string literals are skipped whole, because both contain braces in
this package — `{@link X}` being the common one.

## measureBundleArms

### The settings, because every one of them moves the number

`es2020` and not `esnext`, whose default follows whatever esbuild currently thinks
modern is: a run six months from now would downlevel differently and the
difference would land in the artifact as if the engine had changed. Level 9 for
gzip, which is what the bundle-size tools a reader might check us against use.

Every arm is bundled twice, minified and not. The unminified pass IS the
minification control, and a control not measured in the same run under the same
settings as the thing it attests is not a control.

## TBundlePiece

### The closing argument is written before the reading

What to conclude if the number comes out small is in source, so it is written
before anybody has seen the reading. A measurement that refutes the claim it was
built for is the one most likely to be quietly dropped.
