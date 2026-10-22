import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMPersistRecords, TOIMPersistVersionedShape } from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistCodecVersioned,
    OIMPersistEntityWriter,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';
import { OIMPersistMemoryRecordsStrategy, OIMPersistMemorySnapshotStrategy } from '@oimdb/persist-memory';
import type { TOIMPersistJsonDump } from '../src';
import { OIMPersistJsonBackend } from '../src';

type TQuestion = { id: string; text: string };
type TSettings = { theme: string };
type TQuestionRecords = TOIMPersistRecords<TOIMStoreKey, TQuestion>;
type TJsonPersistor = OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>;

const firstQuestion: TQuestion = { id: 'q1', text: 'Ada' };
const secondQuestion: TQuestion = { id: 'q2', text: 'Grace' };

function buildQuestions(db: OIMDB) {
    const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, TOIMStoreKey>({
        entityWriter: createOIMEntityWriterInPlace(),
    });
    const entityService = createOIMEntityService<TQuestion>(db, {
        keyOf: question => question.id,
        entityWriter: persistEntityWriter,
    });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistRecordSource = new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TQuestion>({
        entityCollectionService: entityService,
        entityStoreSlot,
        persistEntityWriter,
    });
    return { entityService, entityStoreSlot, persistRecordSource };
}

type TQuestions = ReturnType<typeof buildQuestions>;

function createPersistor(persistJsonBackend: OIMPersistJsonBackend): TJsonPersistor {
    return new OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>({
        persistBackend: persistJsonBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    });
}

function createQuestionsSnapshotResource(questions: TQuestions, storageKey: string) {
    return new OIMPersistResourceSnapshot<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TQuestionRecords, TQuestionRecords>({
        persistSnapshotSource: questions.persistRecordSource,
        persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TQuestionRecords>({ storageKey }),
        persistCodec: new OIMPersistCodecIdentity<TQuestionRecords>(),
    });
}

function createQuestionsRecordsResource(questions: TQuestions, storageKey: string) {
    return new OIMPersistResourceRecords<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TOIMStoreKey, TQuestion>({
        persistRecordSource: questions.persistRecordSource,
        persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TQuestion>({ storageKey }),
    });
}

function transportedDumpOf(persistJsonBackend: OIMPersistJsonBackend): TOIMPersistJsonDump {
    return JSON.parse(JSON.stringify(persistJsonBackend.dehydrate())) as TOIMPersistJsonDump;
}

function entitiesOf(
    entityService: TQuestions['entityService'],
    entityStoreSlot: TOIMStoreSlot<
        Map<TOIMStoreKey, TOIMEntitySlot<TQuestion, TOIMStoreKey>>, TOIMEntitySlot<TQuestion, TOIMStoreKey>, Partial<TQuestion>
    >,
): TQuestion[] {
    const entities: TQuestion[] = [];
    for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
        if (entitySlot.entity !== undefined) entities.push({ ...entitySlot.entity });
    }
    return entities;
}

describe('@oimdb/persist-json', () => {
    test('dehydrate returns exactly the JSON text the server inlines', async () => {
        const persistJsonBackend = new OIMPersistJsonBackend();
        const db = new OIMDB();
        const questions = buildQuestions(db);
        const drafts = buildQuestions(db);
        const persistor = createPersistor(persistJsonBackend);
        persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.addPersistResource(createQuestionsRecordsResource(drafts, 'drafts'));
        questions.entityService.slotContentService.upsertEntity(questions.entityStoreSlot,{ ...firstQuestion });
        drafts.entityService.slotContentService.upsertEntity(drafts.entityStoreSlot,{ ...secondQuestion });
        await persistor.persist();

        const persistJsonDump = persistJsonBackend.dehydrate();

        expect(persistJsonDump).toEqual({
            snapshotValues: { questions: { records: [{ key: 'q1', entity: firstQuestion }] } },
            recordsByStorageKey: { drafts: [{ key: 'q2', entity: secondQuestion }] },
        });
        expect(JSON.stringify(persistJsonDump)).toBe(
            '{"snapshotValues":{"questions":{"records":[{"key":"q1","entity":{"id":"q1","text":"Ada"}}]}},'
            + '"recordsByStorageKey":{"drafts":[{"key":"q2","entity":{"id":"q2","text":"Grace"}}]}}',
        );
    });

    test('clearPersisted removes the storage keys from the dump instead of leaving them undefined', async () => {
        const persistJsonBackend = new OIMPersistJsonBackend();
        const db = new OIMDB();
        const questions = buildQuestions(db);
        const drafts = buildQuestions(db);
        const persistor = createPersistor(persistJsonBackend);
        persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.addPersistResource(createQuestionsRecordsResource(drafts, 'drafts'));
        questions.entityService.slotContentService.upsertEntity(questions.entityStoreSlot,{ ...firstQuestion });
        drafts.entityService.slotContentService.upsertEntity(drafts.entityStoreSlot,{ ...secondQuestion });
        await persistor.persist();
        expect(persistJsonBackend.dehydrate().snapshotValues).toHaveProperty('questions');
        expect(persistJsonBackend.dehydrate().recordsByStorageKey).toHaveProperty('drafts');

        await persistor.clearPersisted();

        expect(persistJsonBackend.dehydrate().snapshotValues).not.toHaveProperty('questions');
        expect(persistJsonBackend.dehydrate().recordsByStorageKey).not.toHaveProperty('drafts');
    });

    test('a snapshot and a records table survive the JSON transport into a fresh backend', async () => {
        const serverDb = new OIMDB();
        const serverQuestions = buildQuestions(serverDb);
        const serverDrafts = buildQuestions(serverDb);
        const serverPersistJsonBackend = new OIMPersistJsonBackend();
        const serverPersistor = createPersistor(serverPersistJsonBackend);
        serverPersistor.addPersistResource(createQuestionsSnapshotResource(serverQuestions, 'questions'));
        serverPersistor.addPersistResource(createQuestionsRecordsResource(serverDrafts, 'drafts'));
        serverQuestions.entityService.slotContentService.upsertEntities(serverQuestions.entityStoreSlot,[{ ...firstQuestion }, { ...secondQuestion }]);
        serverDrafts.entityService.slotContentService.upsertEntity(serverDrafts.entityStoreSlot,{ ...secondQuestion });
        await serverPersistor.persist();

        const clientDb = new OIMDB();
        const clientQuestions = buildQuestions(clientDb);
        const clientDrafts = buildQuestions(clientDb);
        const clientPersistor = createPersistor(new OIMPersistJsonBackend({
            initialPersistJsonDump: transportedDumpOf(serverPersistJsonBackend),
        }));
        clientPersistor.addPersistResource(createQuestionsSnapshotResource(clientQuestions, 'questions'));
        clientPersistor.addPersistResource(createQuestionsRecordsResource(clientDrafts, 'drafts'));
        await clientPersistor.hydrate();

        expect(entitiesOf(clientQuestions.entityService, clientQuestions.entityStoreSlot)).toEqual([firstQuestion, secondQuestion]);
        expect(entitiesOf(clientDrafts.entityService, clientDrafts.entityStoreSlot)).toEqual([secondQuestion]);
    });

    test('a versioned codec envelope is what the dump carries, and it decodes after the transport', async () => {
        const persistCodecVersioned = new OIMPersistCodecVersioned<TQuestionRecords, TQuestionRecords>({
            version: 1,
            migrations: {},
            persistCodec: new OIMPersistCodecIdentity<TQuestionRecords>(),
        });
        const createVersionedResource = (questions: TQuestions) => new OIMPersistResourceSnapshot<
            OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TQuestionRecords, TOIMPersistVersionedShape
        >({
            persistSnapshotSource: questions.persistRecordSource,
            persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TOIMPersistVersionedShape>({ storageKey: 'questions' }),
            persistCodec: persistCodecVersioned,
        });
        const serverQuestions = buildQuestions(new OIMDB());
        const serverPersistJsonBackend = new OIMPersistJsonBackend();
        const serverPersistor = createPersistor(serverPersistJsonBackend);
        serverPersistor.addPersistResource(createVersionedResource(serverQuestions));
        serverQuestions.entityService.slotContentService.upsertEntity(serverQuestions.entityStoreSlot,{ ...firstQuestion });
        await serverPersistor.persist();

        expect(serverPersistJsonBackend.dehydrate().snapshotValues.questions).toEqual({
            version: 1,
            data: { records: [{ key: 'q1', entity: firstQuestion }] },
        });

        const clientQuestions = buildQuestions(new OIMDB());
        const clientPersistor = createPersistor(new OIMPersistJsonBackend({
            initialPersistJsonDump: transportedDumpOf(serverPersistJsonBackend),
        }));
        clientPersistor.addPersistResource(createVersionedResource(clientQuestions));
        await clientPersistor.hydrate();

        expect(entitiesOf(clientQuestions.entityService, clientQuestions.entityStoreSlot)).toEqual([firstQuestion]);
    });

    test('a single entity survives the JSON transport', async () => {
        const buildSettings = (db: OIMDB, settings: TSettings) => {
            const singleEntityService = createOIMSingleEntityService<TSettings>(db);
            const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
            singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, settings);
            db.flush();
            const persistResourceSnapshot = new OIMPersistResourceSnapshot<
                OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TSettings, TSettings
            >({
                persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven<TSettings>({
                    channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
                }),
                persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TSettings>({ storageKey: 'settings' }),
                persistCodec: new OIMPersistCodecIdentity<TSettings>(),
            });
            return { singleEntityService, singleEntityStoreSlot, persistResourceSnapshot };
        };
        const serverSettings = buildSettings(new OIMDB(), { theme: 'dark' });
        const serverPersistJsonBackend = new OIMPersistJsonBackend();
        const serverPersistor = createPersistor(serverPersistJsonBackend);
        serverPersistor.addPersistResource(serverSettings.persistResourceSnapshot);
        await serverPersistor.persist();

        const clientSettings = buildSettings(new OIMDB(), { theme: '' });
        const clientPersistor = createPersistor(new OIMPersistJsonBackend({
            initialPersistJsonDump: transportedDumpOf(serverPersistJsonBackend),
        }));
        clientPersistor.addPersistResource(clientSettings.persistResourceSnapshot);
        await clientPersistor.hydrate();

        expect(clientSettings.singleEntityService.slotContentService.findEntityByKey(clientSettings.singleEntityStoreSlot, undefined)).toEqual({ theme: 'dark' });
    });

    test('autosave reaches the dump only after the drain', async () => {
        const persistJsonBackend = new OIMPersistJsonBackend();
        const questions = buildQuestions(new OIMDB());
        const persistor = createPersistor(persistJsonBackend);
        persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.start();

        questions.entityService.slotContentService.upsertEntity(questions.entityStoreSlot,{ ...firstQuestion });
        expect(persistJsonBackend.dehydrate().snapshotValues).not.toHaveProperty('questions');

        await Promise.resolve();
        await persistor.whenIdle();

        expect(persistJsonBackend.dehydrate().snapshotValues.questions).toEqual({
            records: [{ key: 'q1', entity: firstQuestion }],
        });
        persistor.destroy();
    });

    test('a removed resource never reaches the dump', async () => {
        const persistJsonBackend = new OIMPersistJsonBackend();
        const questions = buildQuestions(new OIMDB());
        const persistor = createPersistor(persistJsonBackend);
        const persistResourceSnapshot = persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.start();
        persistor.removePersistResource(persistResourceSnapshot);

        questions.entityService.slotContentService.upsertEntity(questions.entityStoreSlot,{ ...firstQuestion });
        await Promise.resolve();
        await persistor.whenIdle();
        await persistor.persist();

        expect(persistJsonBackend.dehydrate()).toEqual({ snapshotValues: {}, recordsByStorageKey: {} });
        persistor.destroy();
    });
});
