import type { TOIMEntitySlot, TOIMStoreSlot } from '@oimdb/core';
import { createOIMInPlaceEntityWriter, OIMDB } from '@oimdb/core';
import type { TOIMPersistHydrateReconcile, TOIMPersistRecords } from '@oimdb/persist';
import {
    oimReconcileByKey,
    OIMPersistEntityWriter,
    OIMPersistor,
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistRecordsResource,
    OIMPersistFrameScheduler,
    OIMPersistMicrotaskScheduler,
} from '@oimdb/persist';
import { OIMPersistMemoryRecordsService } from '@oimdb/persist-memory';
import { OIMPersistJsonMemoryBackend } from '@oimdb/persist-json';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsService } from '@oimdb/persist-idb';
import { IDBFactory } from 'fake-indexeddb';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

type TQuestion = {
    id: string;
    text: string;
    answer?: string | undefined;
};

type TQuestionStoreSlot = TOIMStoreSlot<Map<string, TOIMEntitySlot<TQuestion, string>>, TOIMEntitySlot<TQuestion, string>, Partial<TQuestion>>;

const createQuestionCollectionService = (db: OIMDB, persistEntityWriter: OIMPersistEntityWriter<TQuestion, string>) =>
    createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TQuestion, string>(db, { entityWriter: persistEntityWriter }) });

type TQuestionCollectionService = ReturnType<typeof createQuestionCollectionService>;

type TQuestionCollection = {
    entityCollectionService: TQuestionCollectionService;
    entityStoreSlot: TQuestionStoreSlot;
    persistCollectionChangeWriteRecordSource: OIMPersistCollectionChangeWriteRecordSource<string, TQuestion>;
};

const reconcileAnswerOntoQuestion: TOIMPersistHydrateReconcile<TOIMPersistRecords<string, TQuestion>> =
    oimReconcileByKey<string, TQuestion>((currentQuestion, incomingAnswer) =>
        currentQuestion === undefined
            ? incomingAnswer
            : { ...currentQuestion, answer: incomingAnswer.answer }
    );

function createQuestionCollection(db: OIMDB): TQuestionCollection {
    const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, string>({
        entityWriter: createOIMInPlaceEntityWriter(),
    });
    const entityCollectionService = createQuestionCollectionService(db, persistEntityWriter);
    const entityStoreSlot = entityCollectionService.createStoreSlot(db);
    const persistCollectionChangeWriteRecordSource = new OIMPersistCollectionChangeWriteRecordSource<string, TQuestion>({
        entityCollectionService,
        entityStoreSlot,
        persistEntityWriter,
    });
    return { entityCollectionService, entityStoreSlot, persistCollectionChangeWriteRecordSource };
}

function keysOf(entityCollectionService: TQuestionCollectionService, entityStoreSlot: TQuestionStoreSlot): string[] {
    const keys: string[] = [];
    for (const entitySlot of entityCollectionService.getSlots(entityStoreSlot)) {
        if (entitySlot.entity !== undefined) keys.push(entitySlot.key);
    }
    return keys;
}

function entitiesOf(entityCollectionService: TQuestionCollectionService, entityStoreSlot: TQuestionStoreSlot): TQuestion[] {
    const entities: TQuestion[] = [];
    for (const entitySlot of entityCollectionService.getSlots(entityStoreSlot)) {
        if (entitySlot.entity !== undefined) entities.push(entitySlot.entity);
    }
    return entities;
}

function findQuestion(questionCollection: TQuestionCollection, key: string): TQuestion | undefined {
    return questionCollection.entityCollectionService.findSlotByKey(questionCollection.entityStoreSlot, key)?.entity;
}

describe('SSR data cycle across packages (json + idb)', () => {
    const persistors: Array<{ destroy(): void }> = [];
    afterEach(() => {
        for (const persistor of persistors.splice(0)) persistor.destroy();
    });

    async function dehydrateServerQuestions(questions: readonly TQuestion[]): Promise<string> {
        const serverQuestionCollection = createQuestionCollection(new OIMDB());
        const persistJsonMemoryBackend = new OIMPersistJsonMemoryBackend();
        const serverPersistor = new OIMPersistor({
            persistBackend: persistJsonMemoryBackend,
            persistScheduler: new OIMPersistMicrotaskScheduler(),
        });
        persistors.push(serverPersistor);
        serverPersistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: serverQuestionCollection.persistCollectionChangeWriteRecordSource,
            persistRecordsService: new OIMPersistMemoryRecordsService<string, TQuestion>({ storageKey: 'questions' }),
        }));
        serverQuestionCollection.entityCollectionService.writeInBatch(serverQuestionCollection.entityStoreSlot, () => (questions).map(entity => serverQuestionCollection.entityCollectionService.writeSlotContentByKey(serverQuestionCollection.entityStoreSlot, entity.id, entity)));
        await serverPersistor.persist();
        return JSON.stringify(persistJsonMemoryBackend.dehydrate());
    }

    async function seedIndexedDbAnswers(
        indexedDb: IDBFactory, databaseName: string, answers: readonly TQuestion[],
    ): Promise<void> {
        const writerQuestionCollection = createQuestionCollection(new OIMDB());
        const writerPersistor = new OIMPersistor({
            persistBackend: new OIMPersistIndexedDbBackend({ databaseName, indexedDb }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
        });
        persistors.push(writerPersistor);
        writerPersistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: writerQuestionCollection.persistCollectionChangeWriteRecordSource,
            persistRecordsService: new OIMPersistIndexedDbRecordsService<string, TQuestion>({ tableName: 'answers' }),
        }));
        writerQuestionCollection.entityCollectionService.writeInBatch(writerQuestionCollection.entityStoreSlot, () => (answers).map(entity => writerQuestionCollection.entityCollectionService.writeSlotContentByKey(writerQuestionCollection.entityStoreSlot, entity.id, entity)));
        await writerPersistor.persist();
    }

    async function hydrateFromServerDump(
        clientQuestionCollection: TQuestionCollection, jsonPersistDumpText: string,
    ): Promise<void> {
        const ssrPersistor = new OIMPersistor({
            persistBackend: new OIMPersistJsonMemoryBackend({ initialPersistJsonDump: JSON.parse(jsonPersistDumpText) }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
        });
        persistors.push(ssrPersistor);
        ssrPersistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: clientQuestionCollection.persistCollectionChangeWriteRecordSource,
            persistRecordsService: new OIMPersistMemoryRecordsService<string, TQuestion>({ storageKey: 'questions' }),
        }));
        await ssrPersistor.hydrate();
    }

    it('server dump -> JSON string -> client hydrate -> durable cache merge', async () => {
        const jsonPersistDumpText = await dehydrateServerQuestions([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
            { id: 'q3', text: 'What is your favourite colour?' },
        ]);

        expect(jsonPersistDumpText).toContain('What is your name?');
        expect(JSON.parse(jsonPersistDumpText)).toEqual({
            snapshotValues: {},
            recordsByStorageKey: {
                questions: [
                    { key: 'q1', entity: { id: 'q1', text: 'What is your name?' } },
                    { key: 'q2', entity: { id: 'q2', text: 'What is your quest?' } },
                    { key: 'q3', entity: { id: 'q3', text: 'What is your favourite colour?' } },
                ],
            },
        });

        const indexedDb = new IDBFactory();
        await seedIndexedDbAnswers(indexedDb, 'survey', [
            { id: 'q1', text: '', answer: 'Sir Lancelot of Camelot' },
            { id: 'q3', text: '', answer: 'Blue' },
            { id: 'q99', text: '', answer: 'Orphan answer' },
        ]);

        const clientQuestionCollection = createQuestionCollection(new OIMDB());
        const { entityCollectionService: clientQuestionsService, entityStoreSlot: clientQuestions } = clientQuestionCollection;
        await hydrateFromServerDump(clientQuestionCollection, jsonPersistDumpText);

        expect(entitiesOf(clientQuestionsService, clientQuestions)).toEqual([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
            { id: 'q3', text: 'What is your favourite colour?' },
        ]);
        expect(findQuestion(clientQuestionCollection, 'q1')?.answer).toBeUndefined();

        const indexedDbPersistor = new OIMPersistor({
            persistBackend: new OIMPersistIndexedDbBackend({ databaseName: 'survey', indexedDb }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
        });
        persistors.push(indexedDbPersistor);
        indexedDbPersistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: clientQuestionCollection.persistCollectionChangeWriteRecordSource,
            persistRecordsService: new OIMPersistIndexedDbRecordsService<string, TQuestion>({ tableName: 'answers' }),
            persistHydrateReconcile: reconcileAnswerOntoQuestion,
        }));
        await indexedDbPersistor.hydrate();

        expect(findQuestion(clientQuestionCollection, 'q1')).toEqual({
            id: 'q1',
            text: 'What is your name?',
            answer: 'Sir Lancelot of Camelot',
        });
        expect(findQuestion(clientQuestionCollection, 'q3')).toEqual({
            id: 'q3',
            text: 'What is your favourite colour?',
            answer: 'Blue',
        });
        expect(findQuestion(clientQuestionCollection, 'q2')).toEqual({
            id: 'q2',
            text: 'What is your quest?',
        });
        expect(findQuestion(clientQuestionCollection, 'q2')?.answer).toBeUndefined();
        expect(findQuestion(clientQuestionCollection, 'q99')).toEqual({
            id: 'q99',
            text: '',
            answer: 'Orphan answer',
        });
        expect(keysOf(clientQuestionsService, clientQuestions)).toEqual(['q1', 'q2', 'q3', 'q99']);
    });

    it('safe sequence works: seed SSR -> hydrate answers -> start autosave', async () => {
        const jsonPersistDumpText = await dehydrateServerQuestions([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
        ]);

        const indexedDb = new IDBFactory();
        await seedIndexedDbAnswers(indexedDb, 'survey2', [
            { id: 'q1', text: '', answer: 'Arthur, King of the Britons' },
        ]);

        const clientDb = new OIMDB();
        const clientQuestionCollection = createQuestionCollection(clientDb);
        const { entityCollectionService: clientQuestionsService, entityStoreSlot: clientQuestions } = clientQuestionCollection;
        await hydrateFromServerDump(clientQuestionCollection, jsonPersistDumpText);

        const indexedDbPersistor = new OIMPersistor({
            persistBackend: new OIMPersistIndexedDbBackend({ databaseName: 'survey2', indexedDb }),
            persistScheduler: new OIMPersistFrameScheduler({ channelSlot: clientDb.defaultChannelSlot }),
        });
        persistors.push(indexedDbPersistor);
        indexedDbPersistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: clientQuestionCollection.persistCollectionChangeWriteRecordSource,
            persistRecordsService: new OIMPersistIndexedDbRecordsService<string, TQuestion>({ tableName: 'answers' }),
            persistHydrateReconcile: reconcileAnswerOntoQuestion,
        }));
        await indexedDbPersistor.hydrate();

        expect(findQuestion(clientQuestionCollection, 'q1')?.answer).toBe('Arthur, King of the Britons');

        indexedDbPersistor.start();
        clientDb.flush();
        await indexedDbPersistor.whenIdle();

        clientQuestionsService.slotContentService.updateEntity(
            clientQuestionsService.getSlotByKey(clientQuestions, 'q2'), { answer: 'To seek the Grail' },
        );
        clientDb.flush();
        await indexedDbPersistor.whenIdle();

        const readerQuestionCollection = createQuestionCollection(new OIMDB());
        const readerPersistor = new OIMPersistor({
            persistBackend: new OIMPersistIndexedDbBackend({ databaseName: 'survey2', indexedDb }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
        });
        persistors.push(readerPersistor);
        readerPersistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: readerQuestionCollection.persistCollectionChangeWriteRecordSource,
            persistRecordsService: new OIMPersistIndexedDbRecordsService<string, TQuestion>({ tableName: 'answers' }),
        }));
        await readerPersistor.hydrate();

        const { entityCollectionService: rereadQuestionsService, entityStoreSlot: rereadQuestions } = readerQuestionCollection;
        expect(keysOf(rereadQuestionsService, rereadQuestions)).toEqual(['q1', 'q2']);
        expect(findQuestion(readerQuestionCollection, 'q1')).toEqual({
            id: 'q1',
            text: '',
            answer: 'Arthur, King of the Britons',
        });
        expect(findQuestion(readerQuestionCollection, 'q2')).toEqual({
            id: 'q2',
            text: 'What is your quest?',
            answer: 'To seek the Grail',
        });
    });
});
