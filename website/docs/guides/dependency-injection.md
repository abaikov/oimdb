---
sidebar_position: 0
description: How an OIMDB application wires itself — one database built at the entry point as the container, handed down rather than imported, with every strategy injected at construction through options and OIMDefaults.
---

# Dependency injection: one database, strategies at construction

OIMDB has no container library, no registry and no global database. The database *is* the container:
`new OIMDB({ createSchemas })` builds every collection, index and computed value of the application once, and
`db.schemas` is what it built. Everything a part of the engine depends on is handed to it when it is constructed,
so nothing is looked up later and nothing is decided on the hot path.

<InShort>

- One `new OIMDB({ createSchemas })` per application, built at the entry point. `db.schemas` is the container.
- Nothing is global: the database is passed down (a React provider, cnstra's global, a function argument), never imported from a module.
- A strategy is chosen at construction, by a factory option or by a shared `OIMDefaults` passed as `defaults`. The write path does not ask which one it got.
- Two collections of the same kind are two entries in a schema.
- A test, a server request or a library builds its own database from the same function and calls `db.dispose()` when it is done.

</InShort>

## The database is the container

How `createSchemas` builds `db.schemas` is on [A database with schemas](/docs/getting-started/oimdb).
The function that builds the database is the application's composition root. It takes what the application wants
to choose — the strategies, the clock — and is the only place those choices are made:

```ts file=app-db.ts
import {
    OIMDB,
    OIMDefaults,
    OIMSlotAfterIdleReleasePolicy,
    createOIMEntitySlotCollectionStoreAggregate,
    createOIMSlotCollectionIndexStoreAggregate,
} from '@oimdb/core';

type TCard = { id: string; deck: string; title: string };

type TAppDBOptions = { defaults: OIMDefaults; getNowMs?: () => number };

const createCardSchema = (db: OIMDB, defaults: OIMDefaults) => {
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, { defaults });
    const archivedCards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db, {
        defaults,
        slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 30_000 }),
    });
    const cardsByDeck = createOIMSlotCollectionIndexStoreAggregate(cards, { selectKey: (card) => card.deck });
    return { cards, archivedCards, cardsByDeck };
};

export const createAppDB = (options: TAppDBOptions) => new OIMDB({
    getNowMs: options.getNowMs,
    createSchemas: (db) => ({ default: createCardSchema(db, options.defaults) }),
});

export type TAppDB = ReturnType<typeof createAppDB>;
```

The entry point is the one place that calls it for the application:

```ts file=main.ts
import { OIMDefaults, createOIMReplacingEntityWriter } from '@oimdb/core';
import { createAppDB } from './app-db';

const db = createAppDB({ defaults: new OIMDefaults({ entityWriter: createOIMReplacingEntityWriter() }) });
db.schemas.default.cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace' });
db.flush();
```

`cards` and `archivedCards` hold the same kind of entity and differ in one injected strategy. There is no "named
instance" mechanism to reach for: a second collection is a second entry in the schema. A schema that reads another
one takes it as an argument — see [Schemas](/docs/getting-started/oimdb#schemas).

## Hand it down, never import it

The entry point builds the database once and passes it to whoever needs it:

| Who needs the database | How it gets it |
|---|---|
| a React tree | `<OIMDBProvider db={db}>`, read by the hook `useOIMDB.withTypes<TAppDB>()` makes — see [React](/docs/packages/react) |
| cnstra neurons | `new CNS(neurons, undefined, db)`, read in a dendrite as `{ global }` — see [OIMDB with cnstra](/docs/guides/with-cnstra) |
| a plain function or class | an argument or a constructor parameter |

A module that exports a database it built is a global under another name: every importer shares one channel and
one flush, and a test that imports it inherits whatever the last test wrote. Export the function that builds the
database and its type, not an instance.

## Strategies are chosen at construction

Every factory takes one options object, and every behaviour that has more than one right answer is an option on
it: `entityWriter`, `slotEmptinessPolicy`, `slotReleasePolicy`, `slotContentService`, `slotStoreService`. The
database itself takes `channelScheduler`, `errorPolicy`, `getNowMs`, `releaseTimer` and
`onBeforeFlush`; a release listener is added afterwards with `db.addSlotReleaseListener(listener)`.

A choice shared by many factories goes into one `OIMDefaults`, passed to each of them as `defaults`; its fields and
which answer wins are under [Building one](/docs/core/collections#building-one). `OIMDefaults` is a value you pass,
not a registry anything looks up: nothing can replace a strategy after the object that uses it was built.

What construction buys is the hot path. The service that was given an in-place writer *is* the in-place arm, so a
write does not branch on a flag to find out which arm it is on; a collection whose release policy never releases
a written slot skips the release check from its first write on.

## A test builds its own

The same function that builds the application's database builds a test's ([Which API to
write](/docs/getting-started/oimdb#which-api-to-write)), with the strategies the test wants:

```ts file=app-db.test.ts
import { OIMDefaults } from '@oimdb/core';
import { createAppDB } from './app-db';

const testDb = createAppDB({ defaults: OIMDefaults.INSTANCE });
const { cards, cardsByDeck } = testDb.schemas.default;

cards.writeSlotContentByKey('c1', { id: 'c1', deck: 'hearts', title: 'Two' });
testDb.flush();
cardsByDeck.getSlotByKey('hearts').getBucketMemberSlotCount();   // 1
testDb.dispose();
```

Two databases never share a flush, so tests running side by side do not see each other's writes.
