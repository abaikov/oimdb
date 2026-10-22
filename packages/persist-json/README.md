# @oimdb/persist-json

JSON-dump backend for [`@oimdb/persist`](../persist): the transport for server-side rendering.
The server persists into memory and dumps that memory as one plain object; the client starts its
backend from the dump and hydrates from it.

It depends on [`@oimdb/persist-memory`](../persist-memory): `OIMPersistJsonBackend` extends
`OIMPersistMemoryBackend`, so it takes the memory strategies (`OIMPersistMemoryRecordsStrategy`,
`OIMPersistMemorySnapshotStrategy`) and behaves like the memory backend in every other respect.

```bash
npm install @oimdb/persist-json @oimdb/persist-memory @oimdb/persist @oimdb/core
```

## Exports

| export | what it is |
|---|---|
| `OIMPersistJsonBackend` | `new OIMPersistJsonBackend({ initialPersistJsonDump? })`; `dehydrate()` returns the dump |
| `TOIMPersistJsonBackendOptions` | `{ initialPersistJsonDump? }` |
| `TOIMPersistJsonDump` | `{ snapshotValues, recordsByStorageKey }`: snapshot values by `storageKey`, and the `{ key, entity }` records of every records `storageKey` |

Records are dumped as arrays of `{ key, entity }`, so a numeric key comes back a number. The
constructor writes the dump straight into the backend's maps, with no write batch and no
persistor involved.

## The SSR flow

The server and the client register the same resources under the same `storageKey`s.

```ts setup
import { OIMDB, createOIMEntityService, createOIMEntityWriterInPlace } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistEntityWriter, OIMPersistRecordSourceCollectionWriteDriven, OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven, OIMPersistor, oimReconcileByKey,
} from '@oimdb/persist';
import { OIMPersistMemoryRecordsStrategy, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';
import { OIMPersistJsonBackend } from '@oimdb/persist-json';
import type { TOIMPersistJsonDump } from '@oimdb/persist-json';

type TQuestion = { id: string; text: string; answer?: string };

const db = new OIMDB();
const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, TOIMStoreKey>({
    entityWriter: createOIMEntityWriterInPlace(),
});
const questionCollectionService = createOIMEntityService<TQuestion>(db, {
    keyOf: question => question.id,
    entityWriter: persistEntityWriter,
});
const questionEntityStoreSlot = questionCollectionService.createStoreSlot(db);

const createQuestionPersistor = (persistJsonBackend: OIMPersistJsonBackend) => {
    const persistor = new OIMPersistor<OIMPersistJsonBackend, OIMPersistMemoryWriteBatch>({
        persistBackend: persistJsonBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    });
    persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
            entityCollectionService: questionCollectionService,
            entityStoreSlot: questionEntityStoreSlot,
            persistEntityWriter,
        }),
        persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TQuestion>({ storageKey: 'questions' }),
    }));
    return persistor;
};
```

### Server: fill, persist, dump

```ts
const persistJsonBackend = new OIMPersistJsonBackend();
const persistor = createQuestionPersistor(persistJsonBackend);

questionCollectionService.slotContentService.upsertEntities(questionEntityStoreSlot, [
    { id: 'q1', text: 'What is your name?' },
    { id: 'q2', text: 'What is your quest?' },
]);
await persistor.persist();

const jsonText = JSON.stringify(persistJsonBackend.dehydrate());
```

`persist()` is queued on the persistor's chain, so the backend holds nothing until its promise
resolves: dump after awaiting it. `dehydrate()` hands back the stored objects themselves (the
memory backend keeps values by reference), so serialize it at once.

### Client: start the backend from the dump, then hydrate

```ts
declare const jsonText: string;

const initialPersistJsonDump = JSON.parse(jsonText) as TOIMPersistJsonDump;
const persistor = createQuestionPersistor(new OIMPersistJsonBackend({ initialPersistJsonDump }));

await persistor.hydrate();
```

The hydrate runs on the persistor's chain too, so the entity store slot holds the questions once its
promise resolves. Render after that.

## Merging a durable local cache over the server dump

The server ships the questions; the user's answers live in a durable backend such as
[`@oimdb/persist-idb`](../persist-idb). Both hydrate into the same entity store slot:

1. Hydrate the JSON persistor first: the store slot holds the server's questions.
2. Hydrate the durable persistor second, with `persistHydrateReconcile`, so the stored answers are
   merged onto the questions instead of replacing them. Without a reconcile, the collection source
   makes the store slot exactly the stored records, and the server's questions that the cache does
   not name are deleted.
3. Start autosave on the durable persistor only after its hydrate.

```ts
declare const initialPersistJsonDump: TOIMPersistJsonDump;
declare const answerPersistJsonDump: TOIMPersistJsonDump;

await createQuestionPersistor(new OIMPersistJsonBackend({ initialPersistJsonDump })).hydrate();

const answerPersistor = new OIMPersistor<OIMPersistJsonBackend, OIMPersistMemoryWriteBatch>({
    persistBackend: new OIMPersistJsonBackend({ initialPersistJsonDump: answerPersistJsonDump }),
    persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
});
answerPersistor.addPersistResource(new OIMPersistResourceRecords({
    persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven({
        entityCollectionService: questionCollectionService,
        entityStoreSlot: questionEntityStoreSlot,
        persistEntityWriter,
    }),
    persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TQuestion>({ storageKey: 'questions' }),
    persistHydrateReconcile: oimReconcileByKey<TOIMStoreKey, TQuestion>(
        (currentQuestion, incomingQuestion) => currentQuestion === undefined
            ? incomingQuestion
            : { ...currentQuestion, answer: incomingQuestion.answer },
    ),
}));
await answerPersistor.hydrate();
answerPersistor.start();
```

A second JSON backend stands in for the durable one here; in an application it is an
`OIMPersistIndexedDbBackend` with an `OIMPersistIndexedDbRecordsStrategy`. `oimReconcileByKey` calls the
resolver for every stored key with what memory holds (`currentQuestion`, from the server) and what
the cache holds (`incomingQuestion`); keys only in memory are kept as they are.

The engine (persistor, resources, sources, schedulers, codecs, reconcile) is
[`@oimdb/persist`](../persist).
