# @oimdb/snapshot-manager

Deprecated, private and empty: it exports nothing. Do not use it in new code.

To find out which keys changed so you can write them to storage, use
[`@oimdb/persist`](../persist). `OIMPersistEntityWriter` reports every entity slot
it writes through `subscribeEntitySlotWritten(onEntitySlotWritten)`, and an
`OIMPersistResourceRecords` over `OIMPersistRecordSourceCollectionWriteDriven` keeps
those slots until the persistor's next write batch takes them. It needs no channel.

To react to a change in the engine itself, use `channel.subscribeAfterEachFrame`
for the frame boundary and each slot's own `changedAtRevision` / `changedAtEpoch`
to see what moved.
