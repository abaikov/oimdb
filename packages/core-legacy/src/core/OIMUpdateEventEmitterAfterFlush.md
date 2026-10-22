# `OIMUpdateEventEmitterAfterFlush` — prose moved out of the source

The block below stood over `export class OIMUpdateEventEmitterAfterFlush` in
`OIMUpdateEventEmitterAfterFlush.ts` and is reproduced verbatim.

Delivers once the frame is over.

For consumers that do not react to a change but ACCUMULATE a description of
the whole frame — an ordered-list command stream folding inserts and moves,
a changed-field tracker collecting which fields moved — and can only publish
that description once it is complete. Delivering mid-frame would hand out a
half-written account of what happened.
