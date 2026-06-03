---
sidebar_position: 2
---

# Relations and Selectors

Relations are collection-bound structures created next to a collection. They keep the `queue + collection` binding in one place, but they do not become part of the collection.

Selectors are reactive read helpers backed by `OIMComputativeRuntime`. They subscribe to the collection and indexes they read from, then deliver coalesced values after `queue.flush()`.

## Derived Indexes

Use derived indexes when membership comes from entity fields.

```typescript
type Card = {
  id: string;
  deckId: string;
  title: string;
  position: number;
};

const cards = createOIMCollectionContext<Card, string>(queue, {
  selectPk: (card) => card.id,
});

const cardsByDeck = cards.relations.derivedArrayIndex(
  (card) => card.deckId,
  { orderBy: (card) => card.position }
);

cards.collection.upsertMany([
  { id: 'c1', deckId: 'deck1', title: 'Second', position: 2 },
  { id: 'c2', deckId: 'deck1', title: 'First', position: 1 },
]);

console.log(cardsByDeck.getPksByKey('deck1')); // ['c2', 'c1']
```

Set-based derived indexes are best for membership where order does not matter:

```typescript
const usersByTeam = users.relations.derivedSetIndex(
  (user) => user.teamId
);
```

Array-based derived indexes support `orderBy` or `compareEntities`.

## Manual Relations

Use manual relations when membership comes from outside the entity itself: search results, permissions, server-provided ordering, or transient UI state.

```typescript
const searchResults = users.relations.arrayBasedIndex<string>();
const visibleUsers = users.relations.orderedList<string>();

searchResults.setPks('query:alice', ['u1']);
visibleUsers.set('main', ['u1', 'u2']);
```

Ordered list command streams emit incremental commands. Insertions use `type: 'insert'`.

```typescript
visibleUsers.push('main', 'u3');

const commands = visibleUsers.getCommandsByKey('main');
const last = commands[commands.length - 1];

if (last?.type === 'insert') {
  console.log(last.pk, last.index);
}
```

## Selector DX

`createOIMCollectionContext` includes `select`, a facade over the lower-level selector classes.

```typescript
const user = users.select.byPk('u1');
const selectedUsers = users.select.byPks(['u1', 'u2']);
const teamUsers = users.select.entitiesBySetIndexKey(usersByTeam, 'team1');
const deckCards = cards.select.entitiesByArrayIndexKey(cardsByDeck, 'deck1');
```

Selectors can be read synchronously:

```typescript
const current = user.getValue();
```

Or watched reactively:

```typescript
const unwatch = teamUsers.watch((value) => {
  console.log(value);
});

users.collection.upsertOneByPk('u1', { name: 'Alicia' });
queue.flush();

unwatch();
```

## Factory Methods

`OIMCollectionRelations` exposes:

- `derivedSetIndex(selectIndexKeys, opts?)`
- `derivedArrayIndex(selectIndexKeys, opts?)`
- `setBasedIndex(opts?)`
- `arrayBasedIndex(opts?)`
- `orderedIndex()`
- `orderedList(opts?)`

`OIMCollectionSelectors` exposes:

- `byPk(pk)`
- `byPks(pks)`
- `entitiesBySetIndexKey(index, key)`
- `entitiesByArrayIndexKey(index, key)`
