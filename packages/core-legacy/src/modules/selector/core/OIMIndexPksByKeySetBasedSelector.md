# `OIMIndexPksByKeySetBasedSelector` — prose moved out of the source

The block below stood over `protected areEqual` in
`OIMIndexPksByKeySetBasedSelector.ts` and is reproduced verbatim.

Compare MEMBERSHIP, not identity.

`getValue` builds a fresh `Set` on every read, so the inherited
`Object.is` could never report two reads as equal — this selector woke
every watcher on every flush that touched the key, even when the pks were
unchanged. Its array-based sibling has always compared contents; this is
the same guarantee, expressed for a set (order carries no meaning here, so
equal size plus containment is equality).
