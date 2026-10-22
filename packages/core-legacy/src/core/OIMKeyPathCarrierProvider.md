# `OIMKeyPathCarrierProvider` — prose moved out of the source

The block below stood over `export class OIMKeyPathCarrierProvider` in
`OIMKeyPathCarrierProvider.ts` and is reproduced verbatim.

Composite-key counterpart of `OIMKeyedCarrierProvider`: backs the index keyed
emitter for key paths. Maps each key path to a carrier holding that path's
subscribers + dirty flag, via a trie (`OIMTrieMap`) so a freshly built
`[a, b, c]` resolves to the same carrier as the one subscribed earlier.

Carriers are created on first subscribe (`getOrReserveCarrier`) and pruned
when their last subscriber leaves (`onCarrierEmptied`) — the trie drops the
empty branch, so a churning key-path space does not leak carriers.
