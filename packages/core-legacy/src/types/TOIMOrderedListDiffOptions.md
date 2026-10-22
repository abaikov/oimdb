# `resetThreshold`

Fraction of shared pks below which a whole `reset` is emitted instead of
fine-grained insert/move/remove commands — when most of a bucket changed, a
reset is cheaper than a pile of edits. Range `(0, 1)`.

Default `0`, meaning always diff. An unchanged order (the same pks in the same
positions) still yields zero commands whatever the value.
