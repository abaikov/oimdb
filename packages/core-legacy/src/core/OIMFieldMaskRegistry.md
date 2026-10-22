# Why a mask and not a set of names

Each entity field gets a bit, so "which fields changed" is one number instead of
a set of strings. Recording a write is an OR, asking "did any field I depend on
change" is an AND, and the whole record for one key is a machine word rather than
an allocated `Set`. Measured against a `Set<string>` on the write path, the mask
costs about half.

Bits are handed out on first sight and never reused, so a mask taken before a new
field appeared stays valid.

Field 33 and beyond fall back to `ALL_FIELDS`: past 32 bits the mask stops
discriminating and every consumer conservatively sees "something changed", which
is correct — only less selective. An entity with more than 32 fields is outside
what this optimisation targets, and silently narrowing would be a correctness
bug.
