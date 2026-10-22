# Why a composite key is a tuple, not a string

A stringified `"a|b|c"` key loses each segment's own type and identity: `1` and
`"1"` collapse, and any separator can collide with a segment that contains it.
A native object or array used as a `Map` key is matched by reference, so a
freshly built `[a, b, c]` would miss a previously stored `[a, b, c]`.

The tuple is matched by content because it is backed at runtime by a trie
(`OIMTrieMap`): lookup walks one native-`Map` level per segment, so it is
O(arity) — effectively O(1) for a fixed arity — and never allocates or hashes a
string key.
