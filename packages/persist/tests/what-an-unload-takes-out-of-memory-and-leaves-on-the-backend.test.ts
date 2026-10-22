import type { TOIMStoreKey } from '@oimdb/core';
import type { TOIMPersistErrorHandler, TOIMPersistOperation } from '../src';
import {
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createTestEntityCollection } from './shared/createTestEntityCollection';

type TCard = { id: string; title: string; score?: number; author?: { name: string } };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function build(onPersistError?: TOIMPersistErrorHandler) {
    const { entityCollectionService, entityStoreSlot, persistEntityWriter } = createTestEntityCollection<TCard>();
    const slotContentEntityService = entityCollectionService.slotContentService;
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        onPersistError,
    });
    const persistRecordsStrategy = testPersistBackend.createRecordsStrategy();
    const persistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TCard>({
            entityCollectionService, entityStoreSlot, persistEntityWriter,
        }),
        persistRecordsStrategy: {
            ...persistRecordsStrategy,
            readRecordsOfKeys: async (_testPersistBackend, keys) => {
                await testPersistBackend.passReadGate();
                return persistRecordsStrategy.readRecordsOfKeys(testPersistBackend, keys);
            },
        },
    }));
    persistor.start();
    const findCardByKey = (key: TOIMStoreKey): TCard | undefined => slotContentEntityService.findEntityByKey(entityStoreSlot, key);
    return {
        persistor,
        persistResourceRecords,
        testPersistBackend,
        findCardByKey,
        upsertCard: (card: TCard): void => { slotContentEntityService.upsertEntity(entityStoreSlot, card); },
        upsertCards: (cards: readonly TCard[]): void => { slotContentEntityService.upsertEntities(entityStoreSlot, cards); },
        updateCardByKey: (key: TOIMStoreKey, patch: Partial<TCard>): void => {
            slotContentEntityService.updateEntity(entityCollectionService.getSlotByKey(entityStoreSlot, key), patch);
        },
        deleteCardByKey: (key: TOIMStoreKey): void => {
            const cardSlot = entityCollectionService.findSlotByKey(entityStoreSlot, key);
            if (cardSlot !== undefined) slotContentEntityService.deleteEntity(cardSlot);
        },
        readTitleInMemory: (key: TOIMStoreKey): string | undefined => findCardByKey(key)?.title,
    };
}

async function buildWithTwoStoredCards(onPersistError?: TOIMPersistErrorHandler): Promise<ReturnType<typeof build>> {
    const world = build(onPersistError);
    world.upsertCards([{ id: 'c1', title: 'alpha' }, { id: 'c2', title: 'beta' }]);
    await tick();
    expect(world.testPersistBackend.readStoredEntities()).toEqual([
        ['c1', { id: 'c1', title: 'alpha' }],
        ['c2', { id: 'c2', title: 'beta' }],
    ]);
    return world;
}

describe('persistor.unload', () => {
    it('takes the entity out of the collection it was read from', async () => {
        const world = await buildWithTwoStoredCards();

        await world.persistor.unload(world.persistResourceRecords, ['c1']);

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.readTitleInMemory('c2')).toBe('beta');
    });

    it('leaves every stored entity with the value the backend already had, written in one commit', async () => {
        const world = await buildWithTwoStoredCards();
        const storedEntitiesBefore = world.testPersistBackend.readStoredEntities();
        const commitCountBefore = world.testPersistBackend.commitCount;

        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        await tick();

        expect(world.testPersistBackend.readStoredEntities()).toEqual(storedEntitiesBefore);
        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore + 1);
    });

    it('keeps an edit made while the persistor was stopped, writing it before the key goes', async () => {
        const world = await buildWithTwoStoredCards();
        world.persistor.stop();

        world.updateCardByKey('c1', { title: 'ALPHA' });
        await world.persistor.unload(world.persistResourceRecords, ['c1']);

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'ALPHA' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
    });

    it('keeps an edit made after the resource was quarantined, writing it before the key goes', async () => {
        const persistOperations: TOIMPersistOperation[] = [];
        const world = await buildWithTwoStoredCards((_error, persistErrorContext) => {
            persistOperations.push(persistErrorContext.persistOperation);
        });
        world.testPersistBackend.failNextCommits(3);
        for (let attempt = 1; attempt <= 3; attempt++) {
            world.updateCardByKey('c1', { title: `failed ${attempt}` });
            await tick();
        }
        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);

        world.updateCardByKey('c1', { title: 'ALPHA' });
        await world.persistor.unload(world.persistResourceRecords, ['c1']);

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'ALPHA' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
    });

    it('hands the entity back with the same values on the next hydrate', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        expect(world.readTitleInMemory('c1')).toBeUndefined();

        await world.persistor.hydrate();

        expect(world.findCardByKey('c1')).toEqual({ id: 'c1', title: 'alpha' });
        expect(world.findCardByKey('c2')).toEqual({ id: 'c2', title: 'beta' });
    });

    it('a restored entity persists its next edit like any other', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await world.persistor.hydrate();

        world.updateCardByKey('c1', { title: 'ALPHA' });
        await tick();

        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'ALPHA' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
    });

    it('writes the edit a flush had not reached yet before it lets the entity go', async () => {
        const world = await buildWithTwoStoredCards();

        world.updateCardByKey('c1', { title: 'ALPHA' });
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        await tick();

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'ALPHA' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
    });

    it('commits an edit that landed while the unload waited its turn through a write batch, before the keys go', async () => {
        const world = await buildWithTwoStoredCards();
        world.testPersistBackend.closeGate();
        world.updateCardByKey('c1', { title: 'A1' });
        await tick();
        const commitCountWithEditInFlight = world.testPersistBackend.commitCount;

        const unloaded = world.persistor.unload(world.persistResourceRecords, ['c1']);
        world.updateCardByKey('c2', { title: 'B2' });
        world.testPersistBackend.openGate();
        await unloaded;
        await tick();

        expect(world.testPersistBackend.commitCount).toBe(commitCountWithEditInFlight + 1);
        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.readTitleInMemory('c2')).toBe('B2');
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'A1' }],
            ['c2', { id: 'c2', title: 'B2' }],
        ]);
    });

    it('does not report the entities it takes out, so the next autosave deletes nothing', async () => {
        const world = await buildWithTwoStoredCards();

        await world.persistor.unload(world.persistResourceRecords, ['c1', 'c2']);
        world.upsertCard({ id: 'c3', title: 'gamma' });
        await tick();

        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'alpha' }],
            ['c2', { id: 'c2', title: 'beta' }],
            ['c3', { id: 'c3', title: 'gamma' }],
        ]);
    });

    it('writes a second round for an edit of the unloaded key that landed while the first commit was held', async () => {
        const world = await buildWithTwoStoredCards();
        world.testPersistBackend.closeGate();

        const unloaded = world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        world.updateCardByKey('c1', { title: 'A2' });
        world.testPersistBackend.openGate();
        await unloaded;
        await tick();

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'A2' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);

        world.updateCardByKey('c2', { title: 'B2' });
        await tick();

        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'A2' }],
            ['c2', { id: 'c2', title: 'B2' }],
        ]);
        expect(world.testPersistBackend.writtenPersistRecordsDeltas.flatMap(persistRecordsDelta => persistRecordsDelta.deletedKeys))
            .toEqual([]);
    });

    it('writes a third round for an edit of the unloaded key that landed while the second commit was held', async () => {
        const world = await buildWithTwoStoredCards();
        const commitCountBefore = world.testPersistBackend.commitCount;
        world.testPersistBackend.closeGate();

        const unloaded = world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore + 1);
        world.updateCardByKey('c1', { title: 'A2' });
        world.testPersistBackend.openGate();
        world.testPersistBackend.closeGate();
        await tick();
        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore + 2);
        world.updateCardByKey('c1', { title: 'A3' });
        world.testPersistBackend.openGate();
        await unloaded;
        await tick();

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'A3' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
    });
});

describe('persistor.unload of an entity whose column never equals itself by ===', () => {
    it('settles in one commit for a NaN column, takes the key out of memory and leaves the NaN entity on the backend', async () => {
        const world = await buildWithTwoStoredCards();
        const commitCountBefore = world.testPersistBackend.commitCount;

        world.upsertCard({ id: 'c3', title: 'gamma', score: NaN });
        await world.persistor.unload(world.persistResourceRecords, ['c3']);
        await tick();
        await tick();

        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore + 1);
        expect(world.findCardByKey('c3')).toBeUndefined();
        expect(world.testPersistBackend.entityByKey.get('c3')).toEqual({ id: 'c3', title: 'gamma', score: NaN });
        expect(Number.isNaN(world.testPersistBackend.entityByKey.get('c3')?.score)).toBe(true);
    });

    it('settles in one commit for a column holding an object kept by reference', async () => {
        const world = await buildWithTwoStoredCards();
        const commitCountBefore = world.testPersistBackend.commitCount;
        const author = { name: 'Ada' };

        world.upsertCard({ id: 'c3', title: 'gamma', author });
        await world.persistor.unload(world.persistResourceRecords, ['c3']);
        await tick();
        await tick();

        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore + 1);
        expect(world.findCardByKey('c3')).toBeUndefined();
        expect(world.testPersistBackend.entityByKey.get('c3')).toEqual({ id: 'c3', title: 'gamma', author: { name: 'Ada' } });
    });
});

describe('persist() after an unload', () => {
    it('keeps the unloaded entity on the backend, writing what memory holds as upserts with no deletion', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);

        await world.persistor.persist();

        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'alpha' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
        expect(world.testPersistBackend.writtenPersistRecordsList).toEqual([]);
        const writtenPersistRecordsDeltas = world.testPersistBackend.writtenPersistRecordsDeltas;
        expect(writtenPersistRecordsDeltas[writtenPersistRecordsDeltas.length - 1]).toEqual({
            upserts: [{ key: 'c2', entity: { id: 'c2', title: 'beta' } }],
            deletedKeys: [],
        });
    });

    it('replaces the table again once a hydrate brought the unloaded key back', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await world.persistor.hydrate();

        await world.persistor.persist();

        expect(world.testPersistBackend.readWrittenRecordsKeys()).toEqual([['c1', 'c2']]);
        expect(new Map(world.testPersistBackend.readStoredEntities())).toEqual(new Map([
            ['c1', { id: 'c1', title: 'alpha' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]));
    });

    it('replaces the table again once clearPersisted wiped the backend', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await world.persistor.clearPersisted();

        await world.persistor.persist();

        expect(world.testPersistBackend.readWrittenRecordsKeys()).toEqual([['c2']]);
        expect(world.testPersistBackend.readStoredEntities()).toEqual([['c2', { id: 'c2', title: 'beta' }]]);
    });

    it('writes the deletion of an entity removed after the unload, so a hydrate does not bring it back', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);

        world.deleteCardByKey('c2');
        await world.persistor.persist();

        expect(world.testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'alpha' }]]);
        const writtenPersistRecordsDeltas = world.testPersistBackend.writtenPersistRecordsDeltas;
        expect(writtenPersistRecordsDeltas[writtenPersistRecordsDeltas.length - 1]).toEqual({ upserts: [], deletedKeys: ['c2'] });

        await world.persistor.hydrate();

        expect(world.findCardByKey('c1')).toEqual({ id: 'c1', title: 'alpha' });
        expect(world.findCardByKey('c2')).toBeUndefined();
    });
});

describe('persistor.load', () => {
    it('puts an unloaded key back with its stored value, commits nothing, and the next persist replaces the table', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        const commitCountBefore = world.testPersistBackend.commitCount;

        await world.persistor.load(world.persistResourceRecords, ['c1']);
        await tick();
        await tick();

        expect(world.findCardByKey('c1')).toEqual({ id: 'c1', title: 'alpha' });
        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore);

        await world.persistor.persist();

        expect(world.testPersistBackend.readWrittenRecordsKeys()).toEqual([['c1', 'c2']]);
        expect(new Map(world.testPersistBackend.readStoredEntities())).toEqual(new Map([
            ['c1', { id: 'c1', title: 'alpha' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]));
    });

    it('does nothing for a key that was never stored and is not in memory', async () => {
        const world = await buildWithTwoStoredCards();
        const storedEntitiesBefore = world.testPersistBackend.readStoredEntities();
        const commitCountBefore = world.testPersistBackend.commitCount;

        await world.persistor.load(world.persistResourceRecords, ['c9']);
        await tick();

        expect(world.findCardByKey('c9')).toBeUndefined();
        expect(world.readTitleInMemory('c1')).toBe('alpha');
        expect(world.readTitleInMemory('c2')).toBe('beta');
        expect(world.testPersistBackend.commitCount).toBe(commitCountBefore);
        expect(world.testPersistBackend.readStoredEntities()).toEqual(storedEntitiesBefore);
    });

    it('keeps a value written in memory while its read was held', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();
        world.testPersistBackend.closeGate();

        const loaded = world.persistor.load(world.persistResourceRecords, ['c1']);
        await tick();
        const backendLog = world.testPersistBackend.backendLog;
        expect(backendLog[backendLog.length - 1]).toBe('read:start');
        world.upsertCard({ id: 'c1', title: 'A2' });
        world.testPersistBackend.openGate();
        await loaded;
        await tick();

        expect(world.readTitleInMemory('c1')).toBe('A2');
        expect(world.testPersistBackend.readStoredEntities()).toEqual([
            ['c1', { id: 'c1', title: 'A2' }],
            ['c2', { id: 'c2', title: 'beta' }],
        ]);
    });

    it('does not bring back a key whose deletion is still pending', async () => {
        const world = await buildWithTwoStoredCards();
        await world.persistor.unload(world.persistResourceRecords, ['c1']);
        await tick();

        world.upsertCard({ id: 'c1', title: 'A2' });
        world.deleteCardByKey('c1');
        await world.persistor.load(world.persistResourceRecords, ['c1']);
        await tick();

        expect(world.readTitleInMemory('c1')).toBeUndefined();
        expect(world.testPersistBackend.readStoredEntities()).toEqual([['c2', { id: 'c2', title: 'beta' }]]);
    });
});
