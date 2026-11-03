import {
    OIMPersistIdentityCodec,
    OIMPersistVersionedCodec,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntrySnapshotService,
    OIMPersistKeyValuePathSnapshotService,
    OIMPersistItemKeyValueStorage,
} from '../src';
import { deleteOIMPath } from '../src/keyvalue/utils/deleteOIMPath';
import { getOIMPath } from '../src/keyvalue/utils/getOIMPath';
import { setOIMPath } from '../src/keyvalue/utils/setOIMPath';
import { OIMTestKeyValueItemStorage } from './shared/OIMTestKeyValueItemStorage';

type TSettings = { theme: string };

function buildPersistKeyValueBackend() {
    const testKeyValueItemStorage = new OIMTestKeyValueItemStorage();
    const persistKeyValueBackend = new OIMPersistKeyValueBackend({
        persistKeyValueStorage: new OIMPersistItemKeyValueStorage({ persistKeyValueItemStorage: testKeyValueItemStorage }),
    });
    return { itemByStorageKey: testKeyValueItemStorage.itemByStorageKey, persistKeyValueBackend };
}

describe('a path walk stays inside the document it was given', () => {
    it('does not delete from Object.prototype when a stored key is __proto__', () => {
        const prototype = Object.prototype as unknown as Record<string, unknown>;
        prototype.plantedByThisTest = 'still here';
        try {
            const root: Record<string, unknown> = {};
            deleteOIMPath(root, ['__proto__', 'plantedByThisTest']);
            expect(prototype.plantedByThisTest).toBe('still here');
        } finally {
            delete prototype.plantedByThisTest;
        }
    });

    it('reads nothing at a name the document does not have', () => {
        expect(getOIMPath({}, ['toString'])).toBeUndefined();
        expect(getOIMPath({}, ['constructor', 'name'])).toBeUndefined();
        expect(getOIMPath({}, ['__proto__'])).toBeUndefined();
    });

    it('descends into a stored __proto__ rather than the prototype', () => {
        const root: Record<string, unknown> = {};
        setOIMPath(root, ['__proto__', 'kept'], 1);
        setOIMPath(root, ['__proto__', 'alsoKept'], 2);
        expect(getOIMPath(root, ['__proto__', 'kept'])).toBe(1);
        expect(getOIMPath(root, ['__proto__', 'alsoKept'])).toBe(2);
        expect(Object.getPrototypeOf(root)).toBe(Object.prototype);
        expect((root as { kept?: unknown }).kept).toBeUndefined();
    });

    it('still writes, reads and removes an ordinary path', () => {
        const root: Record<string, unknown> = {};
        setOIMPath(root, ['cards', 'c1', 'title'], 'ace');
        expect(getOIMPath(root, ['cards', 'c1', 'title'])).toBe('ace');
        deleteOIMPath(root, ['cards', 'c1', 'title']);
        expect(getOIMPath(root, ['cards', 'c1', 'title'])).toBeUndefined();
        expect(getOIMPath(root, ['cards', 'c1'])).toEqual({});
    });

    it('leaves the document alone when an intermediate node is missing', () => {
        const root: Record<string, unknown> = { cards: {} };
        deleteOIMPath(root, ['cards', 'missing', 'title']);
        expect(root).toEqual({ cards: {} });
    });
});

describe('a key-value path strategy whose path names __proto__', () => {
    it('stores the segment as data through the write batch, and reads it back', async () => {
        const { itemByStorageKey, persistKeyValueBackend } = buildPersistKeyValueBackend();
        const persistKeyValuePathSnapshotService = new OIMPersistKeyValuePathSnapshotService<TSettings>({
            storageKey: 'app',
            path: ['__proto__', 'settings'],
        });

        const persistKeyValueWriteBatch = persistKeyValueBackend.createWriteBatch();
        persistKeyValuePathSnapshotService.writeSnapshot(persistKeyValueWriteBatch, { theme: 'dark' });
        await persistKeyValueWriteBatch.commit();

        expect(itemByStorageKey.get('app')).toBe('{"__proto__":{"settings":{"theme":"dark"}}}');
        expect(({} as { settings?: unknown }).settings).toBeUndefined();
        expect(await persistKeyValuePathSnapshotService.readSnapshot(persistKeyValueBackend)).toEqual({ theme: 'dark' });
    });

    it('keeps a sibling under a stored __proto__ when a later batch writes next to it', async () => {
        const { itemByStorageKey, persistKeyValueBackend } = buildPersistKeyValueBackend();
        const settingsPersistKeyValuePathStrategy = new OIMPersistKeyValuePathSnapshotService<TSettings>({
            storageKey: 'app',
            path: ['__proto__', 'settings'],
        });
        const draftPersistKeyValuePathStrategy = new OIMPersistKeyValuePathSnapshotService<TSettings>({
            storageKey: 'app',
            path: ['__proto__', 'draft'],
        });

        const firstPersistKeyValueWriteBatch = persistKeyValueBackend.createWriteBatch();
        settingsPersistKeyValuePathStrategy.writeSnapshot(firstPersistKeyValueWriteBatch, { theme: 'dark' });
        await firstPersistKeyValueWriteBatch.commit();
        const secondPersistKeyValueWriteBatch = persistKeyValueBackend.createWriteBatch();
        draftPersistKeyValuePathStrategy.writeSnapshot(secondPersistKeyValueWriteBatch, { theme: 'light' });
        await secondPersistKeyValueWriteBatch.commit();

        expect(itemByStorageKey.get('app'))
            .toBe('{"__proto__":{"settings":{"theme":"dark"},"draft":{"theme":"light"}}}');
        expect(await settingsPersistKeyValuePathStrategy.readSnapshot(persistKeyValueBackend)).toEqual({ theme: 'dark' });
        expect(await draftPersistKeyValuePathStrategy.readSnapshot(persistKeyValueBackend)).toEqual({ theme: 'light' });
    });

    it('deletes the stored segment and nothing on Object.prototype', async () => {
        const { itemByStorageKey, persistKeyValueBackend } = buildPersistKeyValueBackend();
        const persistKeyValuePathSnapshotService = new OIMPersistKeyValuePathSnapshotService<TSettings>({
            storageKey: 'app',
            path: ['__proto__', 'plantedByThisTest'],
        });
        const firstPersistKeyValueWriteBatch = persistKeyValueBackend.createWriteBatch();
        persistKeyValuePathSnapshotService.writeSnapshot(firstPersistKeyValueWriteBatch, { theme: 'dark' });
        await firstPersistKeyValueWriteBatch.commit();

        const prototype = Object.prototype as unknown as Record<string, unknown>;
        prototype.plantedByThisTest = 'still here';
        try {
            const secondPersistKeyValueWriteBatch = persistKeyValueBackend.createWriteBatch();
            persistKeyValuePathSnapshotService.deleteSnapshot(secondPersistKeyValueWriteBatch);
            await secondPersistKeyValueWriteBatch.commit();

            expect(prototype.plantedByThisTest).toBe('still here');
        } finally {
            delete prototype.plantedByThisTest;
        }
        expect(itemByStorageKey.get('app')).toBe('{"__proto__":{}}');
        expect(await persistKeyValuePathSnapshotService.readSnapshot(persistKeyValueBackend)).toBeUndefined();
    });
});

describe('a write batch that receives a whole value and path writes under the same storage key', () => {
    it('leaves the snapshot objects it was handed unchanged after the commit', async () => {
        const { itemByStorageKey, persistKeyValueBackend } = buildPersistKeyValueBackend();
        const appPersistKeyValueEntryStrategy = new OIMPersistKeyValueEntrySnapshotService<Record<string, unknown>>({ storageKey: 'app' });
        const settingsPersistKeyValuePathStrategy = new OIMPersistKeyValuePathSnapshotService<TSettings>({
            storageKey: 'app',
            path: ['settings'],
        });
        const themePersistKeyValuePathStrategy = new OIMPersistKeyValuePathSnapshotService<string>({
            storageKey: 'app',
            path: ['settings', 'theme'],
        });
        const app: Record<string, unknown> = { users: ['u1'] };
        const settings: TSettings = { theme: 'dark' };

        const persistKeyValueWriteBatch = persistKeyValueBackend.createWriteBatch();
        appPersistKeyValueEntryStrategy.writeSnapshot(persistKeyValueWriteBatch, app);
        settingsPersistKeyValuePathStrategy.writeSnapshot(persistKeyValueWriteBatch, settings);
        themePersistKeyValuePathStrategy.writeSnapshot(persistKeyValueWriteBatch, 'light');
        await persistKeyValueWriteBatch.commit();

        expect(app).toEqual({ users: ['u1'] });
        expect(settings).toEqual({ theme: 'dark' });
        expect(JSON.parse(itemByStorageKey.get('app') ?? 'null')).toEqual({ users: ['u1'], settings: { theme: 'light' } });
    });
});

describe('a snapshot strategy or codec handed what it cannot honour', () => {
    it('refuses a path strategy with an empty path', () => {
        expect(() => new OIMPersistKeyValuePathSnapshotService<TSettings>({ storageKey: 'app', path: [] })).toThrow(/path is empty/);
    });

    it('refuses to decode a stored version above its own', () => {
        const persistVersionedCodec = new OIMPersistVersionedCodec<TSettings, TSettings>({
            version: 1,
            migrations: {},
            persistCodec: new OIMPersistIdentityCodec<TSettings>(),
        });

        expect(() => persistVersionedCodec.decode({ version: 2, data: { theme: 'dark' } })).toThrow(/newer than/);
        expect(persistVersionedCodec.decode({ version: 1, data: { theme: 'dark' } })).toEqual({ theme: 'dark' });
    });
});
