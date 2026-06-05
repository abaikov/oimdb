import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { OIMCollection } from '@oimdb/core';
import { byPk } from '@oimdb/persist';
import { createJsonPersistor } from '@oimdb/persist-json';

type Question = { id: string; text: string; answer?: string };

function QuestionList({ items }: { items: Question[] }) {
    return (
        <ul>
            {items.map(q => (
                <li key={q.id}>
                    {q.text}
                    {q.answer ? ` — ${q.answer}` : ''}
                </li>
            ))}
        </ul>
    );
}

describe('React SSR hydration of dehydrated persist state', () => {
    it('hydrateRoot of the SSR-dehydrated collection produces no mismatch', async () => {
        // --- SERVER: fill a collection and render it to HTML ---
        const server = createJsonPersistor();
        const serverQuestions = new OIMCollection<Question, string>();
        server.collection(serverQuestions).entry({ storageKey: 'questions' });
        serverQuestions.upsertMany([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
        ]);
        await server.persist();

        const html = renderToString(
            <QuestionList items={serverQuestions.getAll()} />
        );
        const json = JSON.stringify(server.dehydrate());

        // --- CLIENT: rebuild the collection from the dehydrated blob ---
        const client = createJsonPersistor({ initial: JSON.parse(json) });
        const clientQuestions = new OIMCollection<Question, string>();
        client.collection(clientQuestions).entry({ storageKey: 'questions' });
        await client.hydrate();

        const container = document.createElement('div');
        container.innerHTML = html;
        const before = container.textContent;

        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        await act(async () => {
            hydrateRoot(
                container,
                <QuestionList items={clientQuestions.getAll()} />
            );
        });

        // No hydration-mismatch warning was emitted.
        const mismatchCalls = errorSpy.mock.calls.filter(args =>
            args.some(
                arg =>
                    typeof arg === 'string' &&
                    /hydrat|did not match|mismatch/i.test(arg)
            )
        );
        expect(mismatchCalls).toEqual([]);
        // The server-rendered DOM text survived hydration unchanged.
        expect(container.textContent).toBe(before);

        errorSpy.mockRestore();
    });

    it('the MERGED state (questions + answers) hydrates without mismatch', async () => {
        // Server ships questions.
        const server = createJsonPersistor();
        const serverQuestions = new OIMCollection<Question, string>();
        server.collection(serverQuestions).entry({ storageKey: 'questions' });
        serverQuestions.upsertMany([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
        ]);
        await server.persist();
        const json = JSON.stringify(server.dehydrate());

        // The user's stored answers travel as their own JSON blob (stand-in for a
        // durable backend, per the persist-json README recipe).
        const answersSource = createJsonPersistor();
        const answersCollection = new OIMCollection<Question, string>();
        answersSource
            .collection(answersCollection)
            .entry({ storageKey: 'questions' });
        answersCollection.upsertMany([
            { id: 'q1', text: '', answer: 'Sir Lancelot' },
        ]);
        await answersSource.persist();
        const answersJson = JSON.stringify(answersSource.dehydrate());

        // CLIENT: seed questions, then merge answers onto them.
        const ssr = createJsonPersistor({ initial: JSON.parse(json) });
        const clientQuestions = new OIMCollection<Question, string>();
        ssr.collection(clientQuestions).entry({ storageKey: 'questions' });
        await ssr.hydrate();

        const local = createJsonPersistor({ initial: JSON.parse(answersJson) });
        local
            .collection(clientQuestions)
            .entry({ storageKey: 'questions' })
            .onHydrate(
                byPk<Question, string>((question, answer) =>
                    question
                        ? { ...question, answer: answer.answer }
                        : answer
                )
            );
        await local.hydrate();

        // The server renders the SAME merged state (what it would inline once the
        // answer is known). Markup must match the client's merged render.
        const html = renderToString(
            <QuestionList items={clientQuestions.getAll()} />
        );

        const container = document.createElement('div');
        container.innerHTML = html;
        const before = container.textContent;
        expect(before).toContain('Sir Lancelot');

        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        await act(async () => {
            hydrateRoot(
                container,
                <QuestionList items={clientQuestions.getAll()} />
            );
        });

        const mismatchCalls = errorSpy.mock.calls.filter(args =>
            args.some(
                arg =>
                    typeof arg === 'string' &&
                    /hydrat|did not match|mismatch/i.test(arg)
            )
        );
        expect(mismatchCalls).toEqual([]);
        expect(container.textContent).toBe(before);

        errorSpy.mockRestore();
    });
});
