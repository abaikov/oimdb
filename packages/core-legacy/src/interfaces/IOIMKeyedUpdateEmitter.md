# `IOIMKeyedUpdateEmitter` — prose moved out of the source

Every block below stood in `IOIMKeyedUpdateEmitter.ts` and is reproduced verbatim, with the
declaration it stood over.

## Over `export interface IOIMKeyedUpdateEmitter`

The keyed pub/sub surface a reactive node needs from its update emitter:
per-key subscribe/unsubscribe plus batched "mark updated" delivery.

Both keyed emitters implement it — `OIMUpdateEventEmitter` (Map of handlers)
and `OIMCarrierKeyedEmitter` (handlers on a per-key carrier). Typing the node
against this interface lets either back the node without leaking the carrier
generic into the node's signatures.

## Over `markUpdatedCarrier`

Fast path: mark a carrier the writer already holds (an entity slot or an
index bucket), skipping the key→carrier lookup entirely. O(1).
