# `OIMKeyedCarrierProvider` — prose moved out of the source

The block below stood over `export class OIMKeyedCarrierProvider` in
`OIMKeyedCarrierProvider.ts` and is reproduced verbatim.

Backs the index keyed emitter: maps each index key to a small carrier object
that holds that key's subscribers + dirty flag. Carriers are created on first
subscribe (`getOrReserveCarrier`) and pruned when their last subscriber
leaves (`onCarrierEmptied`) — mirroring the old per-key handler map, so a
churning key space does not leak carriers.
