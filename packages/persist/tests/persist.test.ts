import { OIMCollection, OIMEventQueue } from '@oimdb/core';
import {
    byPk,
    createCollectionSourceAdapter,
    createVersionedCodec,
    OIMPersistor,
    OIMPersistResource,
    TOIMPersistErrorContext,
    TOIMPersistStrategy,
} from '../src';

type User = {
    id: string;
    name: string;
};

type TStorage = Map<string, unknown>;

/** Minimal in-memory strategy used to exercise the storage-agnostic engine. */
function mapStrategy<TSnapshot>(
    key: string
): TOIMPersistStrategy<OIMPersistor<TStorage>, TSnapshot> {
    return {
        async read(persistor) {
            return persistor.storage.get(key) as TSnapshot | undefined;
        },
        async write(persistor, snapshot) {
            persistor.storage.set(key, snapshot);
        },
        async clear(persistor) {
            persistor.storage.delete(key);
        },
    };
}

function createEnginePersistor(
    options: { queue?: OIMEventQueue; onError?: TOIMPersistorOnError } = {}
): OIMPersistor<TStorage> {
    return new OIMPersistor<TStorage>({ storage: new Map(), ...options });
}

type TOIMPersistorOnError = (
    error: unknown,
    context: TOIMPersistErrorContext
) => void;

describe('persist engine', () => {
    test('persists and hydrates a collection through a custom strategy', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: mapStrategy('users'),
            })
        );

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = new OIMPersistor<TStorage>({
            storage: persistor.storage,
        });
        targetPersistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(targetUsers),
                strategy: mapStrategy('users'),
            })
        );
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('addResource/removeResource control the lifecycle registry', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();
        const resource = persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: mapStrategy('users'),
            })
        );

        expect(persistor.getResources()).toEqual([resource]);

        persistor.removeResource(resource);
        expect(persistor.getResources()).toEqual([]);

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();
        expect(persistor.storage.get('users')).toBeUndefined();
    });

    test('clearPersisted removes the stored snapshot key', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: mapStrategy('users'),
            })
        );

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();
        expect(persistor.storage.get('users')).toBeDefined();

        await persistor.clearPersisted();
        expect(persistor.storage.has('users')).toBe(false);
    });

    test('start autosaves without queue (immediate flush)', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: mapStrategy('users'),
            })
        );

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        await Promise.resolve();

        expect(persistor.storage.get('users')).toEqual({
            records: [{ pk: 'u1', value: { id: 'u1', name: 'Ada' } }],
        });
        persistor.destroy();
    });

    test('start autosaves with queue — batches all mutations from one flush', async () => {
        const queue = new OIMEventQueue();
        const persistor = createEnginePersistor({ queue });
        const users = new OIMCollection<User, string>();
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: mapStrategy('users'),
            })
        );

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });
        expect(persistor.storage.get('users')).toBeUndefined();

        queue.flush();
        await Promise.resolve();

        expect(persistor.storage.get('users')).toEqual({
            records: [
                { pk: 'u1', value: { id: 'u1', name: 'Ada' } },
                { pk: 'u2', value: { id: 'u2', name: 'Grace' } },
            ],
        });
        persistor.destroy();
    });

    test('dirty flag: changes during in-flight write are not lost', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: mapStrategy('users'),
            })
        );
        persistor.start();

        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(persistor.storage.get('users')).toEqual({
            records: [
                { pk: 'u1', value: { id: 'u1', name: 'Ada' } },
                { pk: 'u2', value: { id: 'u2', name: 'Grace' } },
            ],
        });
        persistor.destroy();
    });

    test('hydrate does not trigger an immediate re-persist (isHydrating guard)', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();
        persistor.storage.set('users', {
            records: [{ pk: 'u1', value: { id: 'u1', name: 'Ada' } }],
        });

        let writes = 0;
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: {
                    async read(persistor: OIMPersistor<TStorage>) {
                        return persistor.storage.get('users');
                    },
                    async write() {
                        writes++;
                    },
                    async clear() {},
                },
            })
        );

        persistor.start();
        await persistor.hydrate();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(users.getAll()).toEqual([{ id: 'u1', name: 'Ada' }]);
        expect(writes).toBe(0);
        persistor.destroy();
    });
});

describe('error handling', () => {
    test('hydrate: calls onError per-resource when strategy.read throws', async () => {
        const errors: TOIMPersistErrorContext[] = [];
        const persistor = createEnginePersistor({
            onError: (_err, ctx) => errors.push(ctx),
        });
        const users = new OIMCollection<User, string>();

        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: {
                    async read() {
                        throw new Error('corrupt');
                    },
                    async write() {},
                    async clear() {},
                },
            })
        );

        await expect(persistor.hydrate()).resolves.toBeUndefined();
        expect(errors).toHaveLength(1);
        expect(errors[0].operation).toBe('hydrate');
    });

    test('hydrate: rethrows when no onError provided', async () => {
        const persistor = createEnginePersistor();
        const users = new OIMCollection<User, string>();

        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: {
                    async read() {
                        throw new Error('corrupt');
                    },
                    async write() {},
                    async clear() {},
                },
            })
        );

        await expect(persistor.hydrate()).rejects.toThrow('corrupt');
    });

    test('persist: calls onError per-resource when strategy.write throws', async () => {
        const errors: TOIMPersistErrorContext[] = [];
        const persistor = createEnginePersistor({
            onError: (_err, ctx) => errors.push(ctx),
        });
        const users = new OIMCollection<User, string>();
        users.upsertOne({ id: 'u1', name: 'Ada' });

        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(users),
                strategy: {
                    async read() {
                        return undefined;
                    },
                    async write() {
                        throw new Error('write failure');
                    },
                    async clear() {},
                },
            })
        );

        await expect(persistor.persist()).resolves.toBeUndefined();
        expect(errors).toHaveLength(1);
        expect(errors[0].operation).toBe('persist');
    });
});

describe('createVersionedCodec', () => {
    test('round-trips at current version with no migrations', () => {
        const codec = createVersionedCodec<{ x: number }>({ version: 1, migrations: {} });
        const encoded = codec.encode({ x: 42 });
        expect(encoded).toEqual({ __v: 1, data: { x: 42 } });
        expect(codec.decode(encoded)).toEqual({ x: 42 });
    });

    test('applies single migration from version 0 to 1', () => {
        type Old = { userId: string };
        type New = { id: string };
        const codec = createVersionedCodec<New>({
            version: 1,
            migrations: {
                1: (d) => ({ id: (d as Old).userId }),
            },
        });
        const legacy = { __v: 0, data: { userId: 'u1' } };
        expect(codec.decode(legacy)).toEqual({ id: 'u1' });
    });

    test('chains migrations v1 -> v2 -> v3', () => {
        const codec = createVersionedCodec<{ z: number }>({
            version: 3,
            migrations: {
                2: (d) => ({ y: (d as { x: number }).x * 2 }),
                3: (d) => ({ z: (d as { y: number }).y + 1 }),
            },
        });
        const v1Data = { __v: 1, data: { x: 5 } };
        expect(codec.decode(v1Data)).toEqual({ z: 11 }); // 5*2 + 1
    });

    test('skips all migrations when stored version equals current', () => {
        const spy = jest.fn((d: unknown) => d);
        const codec = createVersionedCodec<{ n: number }>({
            version: 2,
            migrations: { 1: spy, 2: spy },
        });
        codec.decode({ __v: 2, data: { n: 9 } });
        expect(spy).not.toHaveBeenCalled();
    });

    test('integrates with OIMPersistResource: migrates on hydrate', async () => {
        type OldUser = { userId: string; fullName: string };
        type NewUser = { id: string; name: string };

        const codec = createVersionedCodec<{ records: Array<{ pk: string; value: NewUser }> }>({
            version: 1,
            migrations: {
                1: (d) => {
                    const old = d as { records: Array<{ pk: string; value: OldUser }> };
                    return {
                        records: old.records.map((r) => ({
                            pk: r.pk,
                            value: { id: r.value.userId, name: r.value.fullName },
                        })),
                    };
                },
            },
        });

        const legacySnapshot = {
            __v: 0,
            data: { records: [{ pk: 'u1', value: { userId: 'u1', fullName: 'Ada Lovelace' } }] },
        };

        const decoded = codec.decode(legacySnapshot);
        expect(decoded.records[0].value).toEqual({ id: 'u1', name: 'Ada Lovelace' });
    });
});

describe('hydration reconcile (onHydrate / byPk)', () => {
    type Q = { id: string; text?: string; answer?: string };

    function answersResource(
        persistor: OIMPersistor<TStorage>,
        questions: OIMCollection<Q, string>
    ) {
        return persistor
            .addResource(
                new OIMPersistResource({
                    source: createCollectionSourceAdapter(questions),
                    strategy: mapStrategy('answers'),
                })
            )
            .onHydrate(
                byPk((current, incoming) =>
                    current ? { ...current, answer: incoming.answer } : incoming
                )
            );
    }

    test('overlays incoming onto current, leaving untouched entities intact', async () => {
        const persistor = createEnginePersistor();
        const questions = new OIMCollection<Q, string>();
        questions.upsertMany([
            { id: 'q1', text: 'T1' },
            { id: 'q2', text: 'T2' },
        ]);
        // current = questions (from "SSR"); incoming = stored answers (from "storage")
        persistor.storage.set('answers', {
            records: [{ pk: 'q1', value: { id: 'q1', answer: 'A1' } }],
        });
        answersResource(persistor, questions);

        await persistor.hydrate();

        expect(questions.getOneByPk('q1')).toEqual({ id: 'q1', text: 'T1', answer: 'A1' });
        expect(questions.getOneByPk('q2')).toEqual({ id: 'q2', text: 'T2' });
    });

    test('byPk unions keys: an incoming-only entity is added', async () => {
        const persistor = createEnginePersistor();
        const questions = new OIMCollection<Q, string>();
        questions.upsertMany([{ id: 'q1', text: 'T1' }]);
        persistor.storage.set('answers', {
            records: [
                { pk: 'q1', value: { id: 'q1', answer: 'A1' } },
                { pk: 'q9', value: { id: 'q9', answer: 'Z' } },
            ],
        });
        answersResource(persistor, questions);

        await persistor.hydrate();

        expect(questions.getOneByPk('q1')).toEqual({ id: 'q1', text: 'T1', answer: 'A1' });
        expect(questions.getOneByPk('q9')).toEqual({ id: 'q9', answer: 'Z' });
    });

    test('a resolver returning undefined drops the entity', async () => {
        const persistor = createEnginePersistor();
        const questions = new OIMCollection<Q, string>();
        questions.upsertMany([
            { id: 'q1', text: 'T1' },
            { id: 'q2', text: 'T2' },
        ]);
        persistor.storage.set('answers', {
            records: [{ pk: 'q1', value: { id: 'q1', answer: '__DELETE__' } }],
        });
        persistor
            .addResource(
                new OIMPersistResource({
                    source: createCollectionSourceAdapter(questions),
                    strategy: mapStrategy('answers'),
                })
            )
            .onHydrate(
                byPk((current, incoming) =>
                    incoming.answer === '__DELETE__'
                        ? undefined
                        : current
                          ? { ...current, answer: incoming.answer }
                          : incoming
                )
            );

        await persistor.hydrate();

        expect(questions.getOneByPk('q1')).toBeUndefined();
        expect(questions.getOneByPk('q2')).toEqual({ id: 'q2', text: 'T2' });
    });

    test('without onHydrate, hydrate replaces current (default, backward compatible)', async () => {
        const persistor = createEnginePersistor();
        const questions = new OIMCollection<Q, string>();
        questions.upsertMany([{ id: 'q1', text: 'T1' }]);
        persistor.storage.set('answers', {
            records: [{ pk: 'q2', value: { id: 'q2', text: 'T2' } }],
        });
        persistor.addResource(
            new OIMPersistResource({
                source: createCollectionSourceAdapter(questions),
                strategy: mapStrategy('answers'),
            })
        );

        await persistor.hydrate();

        expect(questions.getOneByPk('q1')).toBeUndefined();
        expect(questions.getOneByPk('q2')).toEqual({ id: 'q2', text: 'T2' });
    });
});
