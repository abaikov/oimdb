import type { TOIMEntityColumnName, TOIMEntitySlot, TOIMStoreSlot } from '@oimdb/core';
import { createOIMEntityService, createOIMEntityWriterInPlace, OIMDB } from '@oimdb/core';
import type { TOIMPersistHydrateReconcile, TOIMPersistRecords } from '@oimdb/persist';
import {
    oimReconcileByKey,
    OIMPersistEntityWriter,
    OIMPersistor,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerFrameDriven,
    OIMPersistSchedulerMicrotaskDriven,
} from '@oimdb/persist';
import { OIMPersistMemoryRecordsStrategy } from '@oimdb/persist-memory';
import { OIMPersistJsonBackend } from '@oimdb/persist-json';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy } from '@oimdb/persist-idb';
import { IDBFactory } from 'fake-indexeddb';

type TQuestion = {
    id: string;
    text: string;
    answer?: string | undefined;
};

type TQuestionStoreSlot = TOIMStoreSlot<Map<string, TOIMEntitySlot<TQuestion, string>>, TOIMEntitySlot<TQuestion, string>, Partial<TQuestion>>;

const createQuestionCollectionService = (db: OIMDB, persistEntityWriter: OIMPersistEntityWriter<TQuestion, string>) =>
    createOIMEntityService<TQuestion, TOIMEntityColumnName<TQuestion>, string>(db, {
        keyOf: question => question.id,
        entityWriter: persistEntityWriter,
    });

type TQuestionCollectionService = ReturnType<typeof createQuestionCollectionService>;

type TQuestionCollection = {
    entityCollectionService: TQuestionCollectionService;
    entityStoreSlot: TQuestionStoreSlot;
    persistRecordSourceCollectionChangeDriven: OIMPersistRecordSourceCollectionChangeDriven<string, TQuestion>;
};

const reconcileAnswerOntoQuestion: TOIMPersistHydrateReconcile<TOIMPersistRecords<string, TQuestion>> =
    oimReconcileByKey<string, TQuestion>((currentQuestion, incomingAnswer) =>
        currentQuestion === undefined
            ? incomingAnswer
            : { ...currentQuestion, answer: incomingAnswer.answer }
    );

function createQuestionCollection(db: OIMDB): TQuestionCollection {
    const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, string>({
        entityWriter: createOIMEntityWriterInPlace(),
    });
    const entityCollectionService = createQuestionCollectionService(db, persistEntityWriter);
    const entityStoreSlot = entityCollectionService.createStoreSlot(db);
    const persistRecordSourceCollectionChangeDriven = new OIMPersistRecordSourceCollectionChangeDriven<string, TQuestion>({
        entityCollectionService,
        entityStoreSlot,
        persistEntityWriter,
    });
    return { entityCollectionService, entityStoreSlot, persistRecordSourceCollectionChangeDriven };
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
    return questionCollection.entityCollectionService.slotContentService.findEntityByKey(questionCollection.entityStoreSlot, key);
}

describe('SSR data cycle across packages (json + idb)', () => {
    const persistors: Array<{ destroy(): void }> = [];
    afterEach(() => {
        for (const persistor of persistors.splice(0)) persistor.destroy();
    });

    async function dehydrateServerQuestions(questions: readonly TQuestion[]): Promise<string> {
        const serverQuestionCollection = createQuestionCollection(new OIMDB());
        const persistJsonBackend = new OIMPersistJsonBackend();
        const serverPersistor = new OIMPersistor({
            persistBackend: persistJsonBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(serverPersistor);
        serverPersistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: serverQuestionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<string, TQuestion>({ storageKey: 'questions' }),
        }));
        serverQuestionCollection.entityCollectionService.slotContentService.upsertEntities(
            serverQuestionCollection.entityStoreSlot, questions,
        );
        await serverPersistor.persist();
        return JSON.stringify(persistJsonBackend.dehydrate());
    }

    async function seedIndexedDbAnswers(
        indexedDb: IDBFactory, databaseName: string, answers: readonly TQuestion[],
    ): Promise<void> {
        const writerQuestionCollection = createQuestionCollection(new OIMDB());
        const writerPersistor = new OIMPersistor({
            persistBackend: new OIMPersistIndexedDbBackend({ databaseName, indexedDb }),
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(writerPersistor);
        writerPersistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: writerQuestionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<string, TQuestion>({ tableName: 'answers' }),
        }));
        writerQuestionCollection.entityCollectionService.slotContentService.upsertEntities(
            writerQuestionCollection.entityStoreSlot, answers,
        );
        await writerPersistor.persist();
    }

    async function hydrateFromServerDump(
        clientQuestionCollection: TQuestionCollection, jsonPersistDumpText: string,
    ): Promise<void> {
        const ssrPersistor = new OIMPersistor({
            persistBackend: new OIMPersistJsonBackend({ initialPersistJsonDump: JSON.parse(jsonPersistDumpText) }),
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(ssrPersistor);
        ssrPersistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: clientQuestionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<string, TQuestion>({ storageKey: 'questions' }),
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
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(indexedDbPersistor);
        indexedDbPersistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: clientQuestionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<string, TQuestion>({ tableName: 'answers' }),
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
            persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: clientDb.defaultChannelSlot }),
        });
        persistors.push(indexedDbPersistor);
        indexedDbPersistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: clientQuestionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<string, TQuestion>({ tableName: 'answers' }),
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
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(readerPersistor);
        readerPersistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: readerQuestionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<string, TQuestion>({ tableName: 'answers' }),
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
