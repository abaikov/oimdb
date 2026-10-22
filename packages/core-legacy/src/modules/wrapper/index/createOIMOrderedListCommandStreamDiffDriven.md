# `createOIMOrderedListCommandStreamDiffDriven` — prose moved out of the source

The block below stood over the exported function in
`createOIMOrderedListCommandStreamDiffDriven.ts` and is reproduced verbatim.

Derive an ordered-list command stream from a reactive array-based index — the
index's per-key order changes become position-addressed commands.

```ts
const cardsByDeck = cards.indexFactory.derivedArrayIndex(
    (c) => c.deckId, { orderBy: (c) => c.position }
);
const stream = createOIMOrderedListCommandStreamDiffDriven(queue, cardsByDeck);
stream.subscribeCommands('deck1', () =>
    engine.apply(stream.consumeCommands('deck1')) // insert/move/remove
);
```
