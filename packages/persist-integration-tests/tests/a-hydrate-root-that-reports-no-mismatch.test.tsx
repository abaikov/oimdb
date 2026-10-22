import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import type { TOIMEntityColumnName, TOIMEntitySlot, TOIMStoreSlot } from '@oimdb/core';
import { createOIMEntityService, createOIMEntityWriterInPlace, OIMDB } from '@oimdb/core';
import type { TOIMPersistHydrateReconcile, TOIMPersistRecords } from '@oimdb/persist';
import {
    oimReconcileByKey,
    OIMPersistEntityWriter,
    OIMPersistor,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven,
} from '@oimdb/persist';
import { OIMPersistMemoryRecordsStrategy } from '@oimdb/persist-memory';
import { OIMPersistJsonBackend } from '@oimdb/persist-json';

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

function createQuestionCollection(): TQuestionCollection {
    const persistEntityWriter = new OIMPersistEntityWriter<TQuestion, string>({
        entityWriter: createOIMEntityWriterInPlace(),
    });
    const db = new OIMDB();
    const entityCollectionService = createQuestionCollectionService(db, persistEntityWriter);
    const entityStoreSlot = entityCollectionService.createStoreSlot(db);
    const persistRecordSourceCollectionChangeDriven = new OIMPersistRecordSourceCollectionChangeDriven<string, TQuestion>({
        entityCollectionService,
        entityStoreSlot,
        persistEntityWriter,
    });
    return { entityCollectionService, entityStoreSlot, persistRecordSourceCollectionChangeDriven };
}

function entitiesOf(entityCollectionService: TQuestionCollectionService, entityStoreSlot: TQuestionStoreSlot): TQuestion[] {
    const entities: TQuestion[] = [];
    for (const entitySlot of entityCollectionService.getSlots(entityStoreSlot)) {
        if (entitySlot.entity !== undefined) entities.push(entitySlot.entity);
    }
    return entities;
}

function hydrationMismatchCallsOf(errorSpy: jest.SpyInstance): unknown[][] {
    return errorSpy.mock.calls.filter((args: unknown[]) =>
        args.some(arg => typeof arg === 'string' && /hydrat|did not match|mismatch/i.test(arg))
    );
}

function QuestionList({ questions }: { questions: TQuestion[] }) {
    return (
        <ul>
            {questions.map(question => (
                <li key={question.id}>
                    {question.text}
                    {question.answer ? ` — ${question.answer}` : ''}
                </li>
            ))}
        </ul>
    );
}

describe('React SSR hydration of dehydrated persist state', () => {
    const mounted: Array<ReturnType<typeof hydrateRoot>> = [];
    const persistors: Array<{ destroy(): void }> = [];
    afterEach(async () => {
        await act(async () => {
            for (const root of mounted.splice(0)) root.unmount();
        });
        for (const persistor of persistors.splice(0)) persistor.destroy();
    });

    async function persistToJson(questions: readonly TQuestion[]): Promise<{
        jsonPersistDumpText: string;
        entityCollectionService: TQuestionCollectionService;
        entityStoreSlot: TQuestionStoreSlot;
    }> {
        const questionCollection = createQuestionCollection();
        const persistJsonBackend = new OIMPersistJsonBackend();
        const persistor = new OIMPersistor({
            persistBackend: persistJsonBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(persistor);
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: questionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<string, TQuestion>({ storageKey: 'questions' }),
        }));
        questionCollection.entityCollectionService.slotContentService.upsertEntities(questionCollection.entityStoreSlot, questions);
        await persistor.persist();
        return {
            jsonPersistDumpText: JSON.stringify(persistJsonBackend.dehydrate()),
            entityCollectionService: questionCollection.entityCollectionService,
            entityStoreSlot: questionCollection.entityStoreSlot,
        };
    }

    function createJsonPersistor(
        questionCollection: TQuestionCollection,
        jsonPersistDumpText: string,
        persistHydrateReconcile?: TOIMPersistHydrateReconcile<TOIMPersistRecords<string, TQuestion>>,
    ): { hydrate(): Promise<void> } {
        const persistor = new OIMPersistor({
            persistBackend: new OIMPersistJsonBackend({ initialPersistJsonDump: JSON.parse(jsonPersistDumpText) }),
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistors.push(persistor);
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: questionCollection.persistRecordSourceCollectionChangeDriven,
            persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<string, TQuestion>({ storageKey: 'questions' }),
            persistHydrateReconcile,
        }));
        return persistor;
    }

    it('hydrateRoot of the SSR-dehydrated collection produces no mismatch', async () => {
        const server = await persistToJson([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
        ]);
        const html = renderToString(<QuestionList questions={entitiesOf(server.entityCollectionService, server.entityStoreSlot)} />);

        const clientQuestionCollection = createQuestionCollection();
        await createJsonPersistor(clientQuestionCollection, server.jsonPersistDumpText).hydrate();

        const container = document.createElement('div');
        container.innerHTML = html;
        const serverText = container.textContent;

        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        await act(async () => {
            mounted.push(
                hydrateRoot(
                    container,
                    <QuestionList questions={entitiesOf(clientQuestionCollection.entityCollectionService, clientQuestionCollection.entityStoreSlot)} />
                )
            );
        });

        expect(hydrationMismatchCallsOf(errorSpy)).toEqual([]);
        expect(container.textContent).toBe(serverText);

        errorSpy.mockRestore();
    });

    it('merging local answers AFTER hydration keeps the SSR markup intact and then updates it', async () => {
        const server = await persistToJson([
            { id: 'q1', text: 'What is your name?' },
            { id: 'q2', text: 'What is your quest?' },
        ]);
        const html = renderToString(<QuestionList questions={entitiesOf(server.entityCollectionService, server.entityStoreSlot)} />);
        expect(html).not.toContain('Sir Lancelot');

        const answers = await persistToJson([{ id: 'q1', text: '', answer: 'Sir Lancelot' }]);

        const clientQuestionCollection = createQuestionCollection();
        const { entityCollectionService: clientQuestionsService, entityStoreSlot: clientQuestions } = clientQuestionCollection;
        await createJsonPersistor(clientQuestionCollection, server.jsonPersistDumpText).hydrate();
        const answersPersistor = createJsonPersistor(
            clientQuestionCollection, answers.jsonPersistDumpText, reconcileAnswerOntoQuestion,
        );

        const container = document.createElement('div');
        container.innerHTML = html;
        const serverText = container.textContent;
        expect(serverText).not.toContain('Sir Lancelot');

        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => {
            root = hydrateRoot(container, <QuestionList questions={entitiesOf(clientQuestionsService, clientQuestions)} />);
            mounted.push(root);
        });

        expect(hydrationMismatchCallsOf(errorSpy)).toEqual([]);
        expect(container.textContent).toBe(serverText);

        await answersPersistor.hydrate();
        expect(entitiesOf(clientQuestionsService, clientQuestions)).toEqual([
            { id: 'q1', text: 'What is your name?', answer: 'Sir Lancelot' },
            { id: 'q2', text: 'What is your quest?' },
        ]);

        await act(async () => {
            root?.render(<QuestionList questions={entitiesOf(clientQuestionsService, clientQuestions)} />);
        });

        expect(container.textContent).toContain('Sir Lancelot');
        expect(container.textContent).not.toBe(serverText);

        errorSpy.mockRestore();
    });
});
