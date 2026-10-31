import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import { OIMDB, createOIMInPlaceEntityWriter } from '@oimdb/core';
import type { TOIMPersistRecords, TOIMPersistVersionedShape } from '@oimdb/persist';
import {
    OIMPersistIdentityCodec,
    OIMPersistVersionedCodec,
    OIMPersistEntityWriter,
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistRecordsResource,
    OIMPersistSnapshotResource,
    OIMPersistMicrotaskScheduler,
    OIMPersistSingleEntitySnapshotSource,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch } from '@oimdb/persist-memory';
import { OIMPersistMemoryRecordsService, OIMPersistMemorySnapshotService } from '@oimdb/persist-memory';
import type { TOIMPersistJsonDump } from '../src';
import { OIMPersistJsonMemoryBackend } from '../src';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { createOIMSingleSlotService } from '@oimdb/core';

type TQuestion = { id: string; text: string };
type TSettings = { theme: string };
type TQuestionRecords = TOIMPersistRecords<TOIMStoreKey, TQuestion>;
type TJsonPersistor = OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>;

const firstQuestion: TQuestion = { id: 'q1', text: 'Ada' };
const secondQuestion: TQuestion = { id: 'q2', text: 'Grace' };

function buildQuestions(db: OIMDB) {
    const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, TOIMStoreKey>({
        entityWriter: createOIMInPlaceEntityWriter(),
    });
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TQuestion>({ entityWriter: persistEntityWriter }) });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistRecordSource = new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TQuestion>({
        entityCollectionService: entityService,
        entityStoreSlot,
        persistEntityWriter,
    });
    return { entityService, entityStoreSlot, persistRecordSource };
}

type TQuestions = ReturnType<typeof buildQuestions>;

function createPersistor(persistJsonMemoryBackend: OIMPersistJsonMemoryBackend): TJsonPersistor {
    return new OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>({
        persistBackend: persistJsonMemoryBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
    });
}

function createQuestionsSnapshotResource(questions: TQuestions, storageKey: string) {
    return new OIMPersistSnapshotResource<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TQuestionRecords, TQuestionRecords>({
        persistSnapshotSource: questions.persistRecordSource,
        persistSnapshotService: new OIMPersistMemorySnapshotService<TQuestionRecords>({ storageKey }),
        persistCodec: new OIMPersistIdentityCodec<TQuestionRecords>(),
    });
}

function createQuestionsRecordsResource(questions: TQuestions, storageKey: string) {
    return new OIMPersistRecordsResource<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TOIMStoreKey, TQuestion>({
        persistRecordSource: questions.persistRecordSource,
        persistRecordsService: new OIMPersistMemoryRecordsService<TOIMStoreKey, TQuestion>({ storageKey }),
    });
}

function transportedDumpOf(persistJsonMemoryBackend: OIMPersistJsonMemoryBackend): TOIMPersistJsonDump {
    return JSON.parse(JSON.stringify(persistJsonMemoryBackend.dehydrate())) as TOIMPersistJsonDump;
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
        const persistJsonMemoryBackend = new OIMPersistJsonMemoryBackend();
        const db = new OIMDB();
        const questions = buildQuestions(db);
        const drafts = buildQuestions(db);
        const persistor = createPersistor(persistJsonMemoryBackend);
        persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.addPersistResource(createQuestionsRecordsResource(drafts, 'drafts'));
        questions.entityService.writeSlotContentByKey(questions.entityStoreSlot, ({ ...firstQuestion }).id, { ...firstQuestion });
        drafts.entityService.writeSlotContentByKey(drafts.entityStoreSlot, ({ ...secondQuestion }).id, { ...secondQuestion });
        await persistor.persist();

        const persistJsonDump = persistJsonMemoryBackend.dehydrate();

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
        const persistJsonMemoryBackend = new OIMPersistJsonMemoryBackend();
        const db = new OIMDB();
        const questions = buildQuestions(db);
        const drafts = buildQuestions(db);
        const persistor = createPersistor(persistJsonMemoryBackend);
        persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.addPersistResource(createQuestionsRecordsResource(drafts, 'drafts'));
        questions.entityService.writeSlotContentByKey(questions.entityStoreSlot, ({ ...firstQuestion }).id, { ...firstQuestion });
        drafts.entityService.writeSlotContentByKey(drafts.entityStoreSlot, ({ ...secondQuestion }).id, { ...secondQuestion });
        await persistor.persist();
        expect(persistJsonMemoryBackend.dehydrate().snapshotValues).toHaveProperty('questions');
        expect(persistJsonMemoryBackend.dehydrate().recordsByStorageKey).toHaveProperty('drafts');

        await persistor.clearPersisted();

        expect(persistJsonMemoryBackend.dehydrate().snapshotValues).not.toHaveProperty('questions');
        expect(persistJsonMemoryBackend.dehydrate().recordsByStorageKey).not.toHaveProperty('drafts');
    });

    test('a snapshot and a records table survive the JSON transport into a fresh backend', async () => {
        const serverDb = new OIMDB();
        const serverQuestions = buildQuestions(serverDb);
        const serverDrafts = buildQuestions(serverDb);
        const serverPersistJsonBackend = new OIMPersistJsonMemoryBackend();
        const serverPersistor = createPersistor(serverPersistJsonBackend);
        serverPersistor.addPersistResource(createQuestionsSnapshotResource(serverQuestions, 'questions'));
        serverPersistor.addPersistResource(createQuestionsRecordsResource(serverDrafts, 'drafts'));
        serverQuestions.entityService.writeInBatch(serverQuestions.entityStoreSlot, () => ([{ ...firstQuestion }, { ...secondQuestion }]).map(entity => serverQuestions.entityService.writeSlotContentByKey(serverQuestions.entityStoreSlot, entity.id, entity)));
        serverDrafts.entityService.writeSlotContentByKey(serverDrafts.entityStoreSlot, ({ ...secondQuestion }).id, { ...secondQuestion });
        await serverPersistor.persist();

        const clientDb = new OIMDB();
        const clientQuestions = buildQuestions(clientDb);
        const clientDrafts = buildQuestions(clientDb);
        const clientPersistor = createPersistor(new OIMPersistJsonMemoryBackend({
            initialPersistJsonDump: transportedDumpOf(serverPersistJsonBackend),
        }));
        clientPersistor.addPersistResource(createQuestionsSnapshotResource(clientQuestions, 'questions'));
        clientPersistor.addPersistResource(createQuestionsRecordsResource(clientDrafts, 'drafts'));
        await clientPersistor.hydrate();

        expect(entitiesOf(clientQuestions.entityService, clientQuestions.entityStoreSlot)).toEqual([firstQuestion, secondQuestion]);
        expect(entitiesOf(clientDrafts.entityService, clientDrafts.entityStoreSlot)).toEqual([secondQuestion]);
    });

    test('a versioned codec envelope is what the dump carries, and it decodes after the transport', async () => {
        const persistVersionedCodec = new OIMPersistVersionedCodec<TQuestionRecords, TQuestionRecords>({
            version: 1,
            migrations: {},
            persistCodec: new OIMPersistIdentityCodec<TQuestionRecords>(),
        });
        const createVersionedResource = (questions: TQuestions) => new OIMPersistSnapshotResource<
            OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TQuestionRecords, TOIMPersistVersionedShape
        >({
            persistSnapshotSource: questions.persistRecordSource,
            persistSnapshotService: new OIMPersistMemorySnapshotService<TOIMPersistVersionedShape>({ storageKey: 'questions' }),
            persistCodec: persistVersionedCodec,
        });
        const serverQuestions = buildQuestions(new OIMDB());
        const serverPersistJsonBackend = new OIMPersistJsonMemoryBackend();
        const serverPersistor = createPersistor(serverPersistJsonBackend);
        serverPersistor.addPersistResource(createVersionedResource(serverQuestions));
        serverQuestions.entityService.writeSlotContentByKey(serverQuestions.entityStoreSlot, ({ ...firstQuestion }).id, { ...firstQuestion });
        await serverPersistor.persist();

        expect(serverPersistJsonBackend.dehydrate().snapshotValues.questions).toEqual({
            version: 1,
            data: { records: [{ key: 'q1', entity: firstQuestion }] },
        });

        const clientQuestions = buildQuestions(new OIMDB());
        const clientPersistor = createPersistor(new OIMPersistJsonMemoryBackend({
            initialPersistJsonDump: transportedDumpOf(serverPersistJsonBackend),
        }));
        clientPersistor.addPersistResource(createVersionedResource(clientQuestions));
        await clientPersistor.hydrate();

        expect(entitiesOf(clientQuestions.entityService, clientQuestions.entityStoreSlot)).toEqual([firstQuestion]);
    });

    test('a single entity survives the JSON transport', async () => {
        const buildSettings = (db: OIMDB, settings: TSettings) => {
            const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TSettings>() });
            const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
            singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, settings);
            db.flush();
            const persistSnapshotResource = new OIMPersistSnapshotResource<
                OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TSettings, TSettings
            >({
                persistSnapshotSource: new OIMPersistSingleEntitySnapshotSource<TSettings>({
                    channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
                }),
                persistSnapshotService: new OIMPersistMemorySnapshotService<TSettings>({ storageKey: 'settings' }),
                persistCodec: new OIMPersistIdentityCodec<TSettings>(),
            });
            return { singleEntityService, singleEntityStoreSlot, persistSnapshotResource };
        };
        const serverSettings = buildSettings(new OIMDB(), { theme: 'dark' });
        const serverPersistJsonBackend = new OIMPersistJsonMemoryBackend();
        const serverPersistor = createPersistor(serverPersistJsonBackend);
        serverPersistor.addPersistResource(serverSettings.persistSnapshotResource);
        await serverPersistor.persist();

        const clientSettings = buildSettings(new OIMDB(), { theme: '' });
        const clientPersistor = createPersistor(new OIMPersistJsonMemoryBackend({
            initialPersistJsonDump: transportedDumpOf(serverPersistJsonBackend),
        }));
        clientPersistor.addPersistResource(clientSettings.persistSnapshotResource);
        await clientPersistor.hydrate();

        expect(clientSettings.singleEntityService.findSingleSlot(clientSettings.singleEntityStoreSlot)?.entity).toEqual({ theme: 'dark' });
    });

    test('autosave reaches the dump only after the drain', async () => {
        const persistJsonMemoryBackend = new OIMPersistJsonMemoryBackend();
        const questions = buildQuestions(new OIMDB());
        const persistor = createPersistor(persistJsonMemoryBackend);
        persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.start();

        questions.entityService.writeSlotContentByKey(questions.entityStoreSlot, ({ ...firstQuestion }).id, { ...firstQuestion });
        expect(persistJsonMemoryBackend.dehydrate().snapshotValues).not.toHaveProperty('questions');

        await Promise.resolve();
        await persistor.whenIdle();

        expect(persistJsonMemoryBackend.dehydrate().snapshotValues.questions).toEqual({
            records: [{ key: 'q1', entity: firstQuestion }],
        });
        persistor.destroy();
    });

    test('a removed resource never reaches the dump', async () => {
        const persistJsonMemoryBackend = new OIMPersistJsonMemoryBackend();
        const questions = buildQuestions(new OIMDB());
        const persistor = createPersistor(persistJsonMemoryBackend);
        const persistSnapshotResource = persistor.addPersistResource(createQuestionsSnapshotResource(questions, 'questions'));
        persistor.start();
        persistor.removePersistResource(persistSnapshotResource);

        questions.entityService.writeSlotContentByKey(questions.entityStoreSlot, ({ ...firstQuestion }).id, { ...firstQuestion });
        await Promise.resolve();
        await persistor.whenIdle();
        await persistor.persist();

        expect(persistJsonMemoryBackend.dehydrate()).toEqual({ snapshotValues: {}, recordsByStorageKey: {} });
        persistor.destroy();
    });
});
