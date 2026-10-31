import { OIMDB } from '@oimdb/core';
import type {
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueWriteBatch,
    TOIMPersistKeyValueItemStorage,
    TOIMPersistKeyValueSerializer,
} from '@oimdb/persist';
import {
    OIMPersistIdentityCodec,
    OIMPersistKeyValueEntrySnapshotService,
    OIMPersistSnapshotResource,
    OIMPersistMicrotaskScheduler,
    OIMPersistSingleEntitySnapshotSource,
    OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistLocalStorageKeyValueBackend } from '../src';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSingleSlotService } from '@oimdb/core';

type TSettings = { theme: string };
type TGlobalWithLocalStorage = { localStorage?: TOIMPersistKeyValueItemStorage };

function createPersistKeyValueItemStorage(): TOIMPersistKeyValueItemStorage & { readonly itemByStorageKey: Map<string, string> } {
    const itemByStorageKey = new Map<string, string>();
    return {
        itemByStorageKey,
        getItem: storageKey => itemByStorageKey.get(storageKey) ?? null,
        setItem: (storageKey, item) => {
            itemByStorageKey.set(storageKey, item);
        },
        removeItem: storageKey => {
            itemByStorageKey.delete(storageKey);
        },
    };
}

function createSettingsPersistor(persistLocalStorageKeyValueBackend: OIMPersistLocalStorageKeyValueBackend, settings: TSettings) {
    const db = new OIMDB();
    const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TSettings>() });
    const entityStoreSlot = singleEntityService.createStoreSlot(db);
    singleEntityService.writeSingleSlotContent(entityStoreSlot, settings);
    db.flush();
    const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: persistLocalStorageKeyValueBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
    });
    persistor.addPersistResource(new OIMPersistSnapshotResource<
        OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSettings, TSettings
    >({
        persistSnapshotSource: new OIMPersistSingleEntitySnapshotSource<TSettings>({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot,
        }),
        persistSnapshotService: new OIMPersistKeyValueEntrySnapshotService<TSettings>({ storageKey: 'app:settings' }),
        persistCodec: new OIMPersistIdentityCodec<TSettings>(),
    }));
    const readSettings = () => singleEntityService.findSingleSlot(entityStoreSlot)?.entity;
    return { persistor, readSettings };
}

describe('where the local-storage backend finds its web storage', () => {
    const globalWithLocalStorage = globalThis as TGlobalWithLocalStorage;
    const ownLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    afterEach(() => {
        if (ownLocalStorageDescriptor === undefined) delete globalWithLocalStorage.localStorage;
        else Object.defineProperty(globalThis, 'localStorage', ownLocalStorageDescriptor);
    });

    test('with no storage passed, it writes into globalThis.localStorage', async () => {
        const globalLocalStorage = createPersistKeyValueItemStorage();
        globalWithLocalStorage.localStorage = globalLocalStorage;

        const { persistor } = createSettingsPersistor(new OIMPersistLocalStorageKeyValueBackend(), { theme: 'dark' });
        await persistor.persist();

        expect(globalLocalStorage.getItem('app:settings')).toBe('{"theme":"dark"}');
    });

    test('with no storage passed and no globalThis.localStorage, construction throws and names the option to pass', () => {
        delete globalWithLocalStorage.localStorage;

        expect(() => new OIMPersistLocalStorageKeyValueBackend()).toThrow(
            'OIMPersistLocalStorageKeyValueBackend: globalThis.localStorage is not available in this environment. '
            + 'Pass persistKeyValueItemStorage, for example an in-memory object with getItem, setItem and removeItem.',
        );
    });

    test('a storage passed in wins over globalThis.localStorage, which is left untouched', async () => {
        const globalLocalStorage = createPersistKeyValueItemStorage();
        globalWithLocalStorage.localStorage = globalLocalStorage;
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();

        const { persistor } = createSettingsPersistor(
            new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage }), { theme: 'dark' },
        );
        await persistor.persist();

        expect(persistKeyValueItemStorage.getItem('app:settings')).toBe('{"theme":"dark"}');
        expect(globalLocalStorage.itemByStorageKey.size).toBe(0);
    });

    test('a serializer passed in writes the text web storage holds, and reads it back on hydrate', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const persistKeyValueSerializer: TOIMPersistKeyValueSerializer = {
            serialize: value => `v1|${JSON.stringify(value)}`,
            deserialize: item => JSON.parse(item.slice('v1|'.length)) as unknown,
        };

        const source = createSettingsPersistor(
            new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage, persistKeyValueSerializer }), { theme: 'dark' },
        );
        await source.persistor.persist();
        const target = createSettingsPersistor(
            new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage, persistKeyValueSerializer }), { theme: '' },
        );
        await target.persistor.hydrate();

        expect(persistKeyValueItemStorage.getItem('app:settings')).toBe('v1|{"theme":"dark"}');
        expect(target.readSettings()).toEqual({ theme: 'dark' });
    });
});
