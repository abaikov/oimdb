# @oimdb/persist-json

JSON-dump backend for [`@oimdb/persist`](../persist): the transport for server-side rendering.
The server persists into memory and dumps that memory as one plain object; the client starts its
backend from the dump and hydrates from it.

It depends on [`@oimdb/persist-memory`](../persist-memory): `OIMPersistJsonMemoryBackend` extends
`OIMPersistMemoryBackend`, so it takes the memory strategies (`OIMPersistMemoryRecordsService`,
`OIMPersistMemorySnapshotService`) and behaves like the memory backend in every other respect.

```bash
npm install @oimdb/persist-json @oimdb/persist-memory @oimdb/persist @oimdb/core
```

## Exports

| export | what it is |
|---|---|
| `OIMPersistJsonMemoryBackend` | `new OIMPersistJsonMemoryBackend({ initialPersistJsonDump? })`; `dehydrate()` returns the dump |
| `TOIMPersistJsonMemoryBackendOptions` | `{ initialPersistJsonDump? }` |
| `TOIMPersistJsonDump` | `{ snapshotValues, recordsByStorageKey }`: snapshot values by `storageKey`, and the `{ key, entity }` records of every records `storageKey` |

Records are dumped as arrays of `{ key, entity }`, so a numeric key comes back a number. The
constructor writes the dump straight into the backend's maps, with no write batch and no
persistor involved.

## The SSR flow

The server and the client register the same resources under the same `storageKey`s.

```ts setup
import { OIMDB, createOIMInPlaceEntityWriter, createOIMSlotContentEntityService, createOIMSlotCollectionService } from '@oimdb/core';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMPersistEntityWriter, OIMPersistCollectionWriteRecordSource, OIMPersistRecordsResource,
    OIMPersistMicrotaskScheduler, OIMPersistor, oimReconcileByKey,
} from '@oimdb/persist';
import { OIMPersistMemoryRecordsService, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';
import { OIMPersistJsonMemoryBackend } from '@oimdb/persist-json';
import type { TOIMPersistJsonDump } from '@oimdb/persist-json';

type TQuestion = { id: string; text: string; answer?: string };

const db = new OIMDB();
const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, TOIMStoreKey>({
    entityWriter: createOIMInPlaceEntityWriter(),
});
const questionCollectionService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TQuestion>(db, { entityWriter: persistEntityWriter }) });
const questionEntityStoreSlot = questionCollectionService.createStoreSlot(db);

const createQuestionPersistor = (persistJsonMemoryBackend: OIMPersistJsonMemoryBackend) => {
    const persistor = new OIMPersistor<OIMPersistJsonMemoryBackend, OIMPersistMemoryWriteBatch>({
        persistBackend: persistJsonMemoryBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
    });
    persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: new OIMPersistCollectionWriteRecordSource({
            entityCollectionService: questionCollectionService,
            entityStoreSlot: questionEntityStoreSlot,
            persistEntityWriter,
        }),
        persistRecordsService: new OIMPersistMemoryRecordsService<TOIMStoreKey, TQuestion>({ storageKey: 'questions' }),
    }));
    return persistor;
};
```

### Server: fill, persist, dump

```ts
const persistJsonMemoryBackend = new OIMPersistJsonMemoryBackend();
const persistor = createQuestionPersistor(persistJsonMemoryBackend);

questionCollectionService.writeInBatch(questionEntityStoreSlot, () => ([
    { id: 'q1', text: 'What is your name?' },
    { id: 'q2', text: 'What is your quest?' },
]).map(entity => questionCollectionService.writeSlotContentByKey(questionEntityStoreSlot, entity.id, entity)));
await persistor.persist();

const jsonText = JSON.stringify(persistJsonMemoryBackend.dehydrate());
```

`persist()` is queued on the persistor's chain, so the backend holds nothing until its promise
resolves: dump after awaiting it. `dehydrate()` hands back the stored objects themselves (the
memory backend keeps values by reference), so serialize it at once.

### Client: start the backend from the dump, then hydrate

```ts
declare const jsonText: string;

const initialPersistJsonDump = JSON.parse(jsonText) as TOIMPersistJsonDump;
const persistor = createQuestionPersistor(new OIMPersistJsonMemoryBackend({ initialPersistJsonDump }));

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

await createQuestionPersistor(new OIMPersistJsonMemoryBackend({ initialPersistJsonDump })).hydrate();

const answerPersistor = new OIMPersistor<OIMPersistJsonMemoryBackend, OIMPersistMemoryWriteBatch>({
    persistBackend: new OIMPersistJsonMemoryBackend({ initialPersistJsonDump: answerPersistJsonDump }),
    persistScheduler: new OIMPersistMicrotaskScheduler(),
});
answerPersistor.addPersistResource(new OIMPersistRecordsResource({
    persistRecordSource: new OIMPersistCollectionWriteRecordSource({
        entityCollectionService: questionCollectionService,
        entityStoreSlot: questionEntityStoreSlot,
        persistEntityWriter,
    }),
    persistRecordsService: new OIMPersistMemoryRecordsService<TOIMStoreKey, TQuestion>({ storageKey: 'questions' }),
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
`OIMPersistIndexedDbBackend` with an `OIMPersistIndexedDbRecordsService`. `oimReconcileByKey` calls the
resolver for every stored key with what memory holds (`currentQuestion`, from the server) and what
the cache holds (`incomingQuestion`); keys only in memory are kept as they are.

The engine (persistor, resources, sources, schedulers, codecs, reconcile) is
[`@oimdb/persist`](../persist).
