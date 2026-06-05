import { OIMCollection } from '@oimdb/core';
import { byPk } from '@oimdb/persist';
import { createJsonPersistor } from '../src';

type Question = {
    id: string;
    text: string;
    answer?: string;
};

describe('@oimdb/persist-json', () => {
    test('dump → JSON string → hydrate roundtrip', async () => {
        const server = createJsonPersistor();
        const serverUsers = new OIMCollection<Question, string>();
        server.collection(serverUsers).entry({ storageKey: 'users' });

        serverUsers.upsertMany([
            { id: 'u1', text: 'Ada' },
            { id: 'u2', text: 'Grace' },
        ]);
        await server.persist();

        // Serialize across the server/client boundary.
        const blob = JSON.parse(JSON.stringify(server.dehydrate()));

        const client = createJsonPersistor({ initial: blob });
        const clientUsers = new OIMCollection<Question, string>();
        client.collection(clientUsers).entry({ storageKey: 'users' });
        await client.hydrate();

        expect(clientUsers.getAll()).toEqual([
            { id: 'u1', text: 'Ada' },
            { id: 'u2', text: 'Grace' },
        ]);
    });

    test('dehydrate() returns a plain JSON-serializable object', async () => {
        const server = createJsonPersistor();
        const users = new OIMCollection<Question, string>();
        server.collection(users).entry({ storageKey: 'users' });

        users.upsertOne({ id: 'u1', text: 'Ada' });
        await server.persist();

        const dump = server.dehydrate();
        // Shape is `{ users: { records: [...] } }`.
        expect(dump).toEqual({
            users: { records: [{ pk: 'u1', value: { id: 'u1', text: 'Ada' } }] },
        });
        // JSON round-trips without loss.
        expect(JSON.parse(JSON.stringify(dump))).toEqual(dump);
    });

    test('SSR + merge via onHydrate overlays local answers onto SSR questions', async () => {
        // --- Server: persist questions into a JSON blob. ---
        const server = createJsonPersistor();
        const serverQuestions = new OIMCollection<Question, string>();
        server.collection(serverQuestions).entry({ storageKey: 'questions' });
        serverQuestions.upsertMany([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
        ]);
        await server.persist();
        const ssrBlob = JSON.parse(JSON.stringify(server.dehydrate()));

        // --- Local durable source: stored answers (acted by a JSON persistor).
        // Answers ride on the same `Question` collection shape; only `answer`
        // is meaningful here (text comes from the server on merge). ---
        const localStore = createJsonPersistor();
        const localAnswers = new OIMCollection<Question, string>();
        localStore.collection(localAnswers).entry({ storageKey: 'questions' });
        localAnswers.upsertMany([
            { id: 'q1', text: '', answer: 'Lancelot' },
            { id: 'q2', text: '', answer: 'The Holy Grail' },
        ]);
        await localStore.persist();
        const localBlob = JSON.parse(JSON.stringify(localStore.dehydrate()));

        // --- Client: one collection hydrated from SSR first, then merged. ---
        const questions = new OIMCollection<Question, string>();

        const ssr = createJsonPersistor({ initial: ssrBlob });
        ssr.collection(questions).entry({ storageKey: 'questions' });
        await ssr.hydrate();

        const local = createJsonPersistor({ initial: localBlob });
        local
            .collection(questions)
            .entry({ storageKey: 'questions' })
            .onHydrate(
                byPk((question, answer) =>
                    question
                        ? { ...question, answer: answer.answer }
                        : answer
                )
            );
        await local.hydrate();

        expect(questions.getAll()).toEqual([
            { id: 'q1', text: 'What is your name?', answer: 'Lancelot' },
            { id: 'q2', text: 'What is your quest?', answer: 'The Holy Grail' },
        ]);
    });

    test('clearPersisted() removes the key from dehydrate() output', async () => {
        const persistor = createJsonPersistor();
        const users = new OIMCollection<Question, string>();
        persistor.collection(users).entry({ storageKey: 'users' });

        users.upsertOne({ id: 'u1', text: 'Ada' });
        await persistor.persist();
        expect(persistor.dehydrate()).toHaveProperty('users');

        await persistor.clearPersisted();
        expect(persistor.dehydrate()).not.toHaveProperty('users');
    });
});
