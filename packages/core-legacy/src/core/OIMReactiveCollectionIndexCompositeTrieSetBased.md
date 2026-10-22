# `OIMReactiveCollectionIndexCompositeTrieSetBased` — prose moved out of the source

Every block below stood in `OIMReactiveCollectionIndexCompositeTrieSetBased.ts` and is
reproduced verbatim, with the declaration or statement it stood over.

## Over `export class OIMReactiveCollectionIndexCompositeTrieSetBased`

Collection-bound reactive Set-based index keyed by a composite key path
(`TOIMKeyPath`) — an arbitrary-length tuple of primitive segments, e.g.
`[userId, projectId, role]`.

Composite counterpart of `OIMReactiveCollectionIndexManualSetBased`: same
manual `setPks`/`addPks`/`removePks` surface and collection slot resolution,
but every key is a path matched by content in O(arity). Because the pk→slot
membership lives ON the store bucket (not a separate key-indexed structure), a
pk-write walks the key-path trie exactly once — for both the bucket and its
membership. The full path is the lookup unit (no partial/prefix queries);
subscriptions deliver per full path off the bucket carrier.

The primitive-keyed indexes are untouched and keep their native-`Map` fast
path — the trie cost is paid only by this opt-in index.

## Over the non-reserving resolve

Non-reserving resolve used by `removePks` to canonicalize a raw pk to its
`slot.pk` (the membership key) without creating a slot for an absent pk.

## Inside `removePks`

Canonicalize raw pks to their `slot.pk` (the membership key), then
remove by that. A pk with no slot (already gone) is skipped.
