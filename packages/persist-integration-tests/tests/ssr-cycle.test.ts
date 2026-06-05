import { OIMCollection } from '@oimdb/core';
import { byPk } from '@oimdb/persist';
import { createJsonPersistor } from '@oimdb/persist-json';
import { createIndexedDbPersistor } from '@oimdb/persist-idb';
import { IDBFactory } from 'fake-indexeddb';

type Question = { id: string; text: string; answer?: string };

/**
 * The canonical SSR scenario: read-only questions ship from the server via the
 * JSON dehydrate/hydrate transport, while the user's own answers live in a
 * durable local store (IndexedDB) and are merged onto the SSR pre-state.
 */
describe('SSR data cycle across packages (json + idb)', () => {
    it('server dump -> JSON string -> client hydrate -> durable cache merge', async () => {
        // --- SERVER: fill questions and dehydrate to a JSON string ---
        const server = createJsonPersistor();
        const serverQuestions = new OIMCollection<Question, string>();
        server.collection(serverQuestions).entry({ storageKey: 'questions' });

        serverQuestions.upsertMany([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
            { id: 'q3', text: 'What is your favourite colour?' },
        ]);
        await server.persist();

        const json = JSON.stringify(server.dehydrate());

        // It is a real JSON string carrying the questions.
        expect(typeof json).toBe('string');
        expect(json).toContain('What is your name?');
        const parsedDump = JSON.parse(json) as Record<string, unknown>;
        expect(parsedDump).toHaveProperty('questions');

        // --- SEED a durable IndexedDB cache with the user's stored answers ---
        // A real app's previous session wrote these. Answers are stored as
        // partial Question records keyed by the same id.
        const indexedDb = new IDBFactory();
        const writer = createIndexedDbPersistor({
            databaseName: 'survey',
            indexedDb,
        });
        const writerAnswers = new OIMCollection<Question, string>();
        writer
            .collection(writerAnswers)
            .entry({ tableName: 'answers', primaryKey: 'answers' });
        writerAnswers.upsertMany([
            // q1 is answered; q3 is answered; q2 is left blank.
            { id: 'q1', text: '', answer: 'Sir Lancelot of Camelot' },
            { id: 'q3', text: '', answer: 'Blue' },
            // An answer whose question does not exist on the server.
            { id: 'q99', text: '', answer: 'Orphan answer' },
        ]);
        await writer.persist();

        // --- CLIENT phase 1: seed the collection from the SSR blob ---
        const ssr = createJsonPersistor({ initial: JSON.parse(json) });
        const clientQuestions = new OIMCollection<Question, string>();
        ssr.collection(clientQuestions).entry({ storageKey: 'questions' });
        await ssr.hydrate();

        // The collection now holds the server questions (text present, no answer).
        expect(clientQuestions.getAll()).toEqual([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
            { id: 'q3', text: 'What is your favourite colour?' },
        ]);
        expect(clientQuestions.getOneByPk('q1')?.answer).toBeUndefined();

        // --- CLIENT phase 2: merge the durable cache ON TOP of the SSR state ---
        // A fresh persistor opens the SAME database and reads the answers back,
        // overlaying them onto the same clientQuestions collection.
        const idb = createIndexedDbPersistor({
            databaseName: 'survey',
            indexedDb,
        });
        idb.collection(clientQuestions)
            .entry({ tableName: 'answers', primaryKey: 'answers' })
            .onHydrate(
                byPk<Question, string>((question, answer) =>
                    question
                        ? { ...question, answer: answer.answer }
                        : answer
                )
            );
        await idb.hydrate();

        // --- ASSERT the merge ---
        // Answered questions keep their server text and gain the stored answer.
        expect(clientQuestions.getOneByPk('q1')).toEqual({
            id: 'q1',
            text: 'What is your name?',
            answer: 'Sir Lancelot of Camelot',
        });
        expect(clientQuestions.getOneByPk('q3')).toEqual({
            id: 'q3',
            text: 'What is your favourite colour?',
            answer: 'Blue',
        });
        // Unanswered question keeps its text and has no answer.
        expect(clientQuestions.getOneByPk('q2')).toEqual({
            id: 'q2',
            text: 'What is your quest?',
        });
        expect(clientQuestions.getOneByPk('q2')?.answer).toBeUndefined();
        // The orphan answer (no server question) falls through to the resolver's
        // `answer` branch and is kept.
        expect(clientQuestions.getOneByPk('q99')).toEqual({
            id: 'q99',
            text: '',
            answer: 'Orphan answer',
        });

        // Order is preserved: server questions first (their order), then the
        // incoming-only key.
        expect(clientQuestions.getAllPks()).toEqual(['q1', 'q2', 'q3', 'q99']);
    });

    it('safe sequence works: seed SSR -> hydrate answers -> start autosave', async () => {
        // This documents the ordering hazard contract from the README: autosave
        // on the durable persistor must be enabled only AFTER its hydrate, so the
        // merge is never written back mid-flight. Here we verify the safe order
        // end-to-end and that a post-hydrate edit autosaves durably.
        const json = JSON.stringify(
            (() => {
                const server = createJsonPersistor();
                const q = new OIMCollection<Question, string>();
                server.collection(q).entry({ storageKey: 'questions' });
                q.upsertMany([
                    { id: 'q1', text: 'What is your name?' },
                    { id: 'q2', text: 'What is your quest?' },
                ]);
                // persist() is synchronous in effect for the json backend.
                void server.persist();
                return server.dehydrate();
            })()
        );

        const indexedDb = new IDBFactory();

        // Seed the durable store with one existing answer.
        const writer = createIndexedDbPersistor({
            databaseName: 'survey2',
            indexedDb,
        });
        const writerAnswers = new OIMCollection<Question, string>();
        writer
            .collection(writerAnswers)
            .entry({ tableName: 'answers', primaryKey: 'answers' });
        writerAnswers.upsertMany([
            { id: 'q1', text: '', answer: 'Arthur, King of the Britons' },
        ]);
        await writer.persist();

        // 1. Seed from SSR.
        const ssr = createJsonPersistor({ initial: JSON.parse(json) });
        const clientQuestions = new OIMCollection<Question, string>();
        ssr.collection(clientQuestions).entry({ storageKey: 'questions' });
        await ssr.hydrate();

        // 2. Hydrate the durable answers BEFORE starting autosave.
        const idb = createIndexedDbPersistor({
            databaseName: 'survey2',
            indexedDb,
        });
        idb.collection(clientQuestions)
            .entry({ tableName: 'answers', primaryKey: 'answers' })
            .onHydrate(
                byPk<Question, string>((question, answer) =>
                    question
                        ? { ...question, answer: answer.answer }
                        : answer
                )
            );
        await idb.hydrate();

        expect(clientQuestions.getOneByPk('q1')?.answer).toBe(
            'Arthur, King of the Britons'
        );

        // 3. Only now enable autosave; a new answer must persist durably.
        idb.start();
        clientQuestions.upsertOneByPk('q2', { answer: 'To seek the Grail' });

        // Let the microtask-scheduled flush run.
        await new Promise(resolve => setTimeout(resolve, 0));

        // Read it back with yet another fresh persistor against the same db.
        const reader = createIndexedDbPersistor({
            databaseName: 'survey2',
            indexedDb,
        });
        const reread = new OIMCollection<Question, string>();
        reader
            .collection(reread)
            .entry({ tableName: 'answers', primaryKey: 'answers' });
        await reader.hydrate();

        // The whole merged collection (questions + both answers) was written.
        expect(reread.getOneByPk('q1')?.answer).toBe(
            'Arthur, King of the Britons'
        );
        expect(reread.getOneByPk('q2')?.answer).toBe('To seek the Grail');
    });
});
