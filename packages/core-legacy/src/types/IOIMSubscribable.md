# `dirty` and `dirtyFields`

Both fields are owned by the keyed emitter and must not be read or written
anywhere else.

`dirty` is batch membership: `true` while the carrier sits in the pending flush
batch, which lets the emitter dedup marks with an O(1) boolean check instead of
a `Set` identity-hash lookup. It is reset to `false` as the carrier is delivered,
and on flush teardown.

`dirtyFields` is a bitmask of the fields written to this carrier during the
current frame, recorded only by a collection built with
`OIMSlotWriterFieldMasked`. It sits on the plain carrier contract rather than a
field-specific one because the plain emitter is what CLEARS it: settling the
frame is the emitter's job whether or not anyone recorded fields, and a carrier
that never had a mask never grows the property. It is meaningful only while
`dirty` — outside a frame it reads as `NO_FIELDS`.
