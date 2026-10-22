import { oimOpenIndexedDb } from '../src/utils/oimOpenIndexedDb';

type TFakeOpenRequest = {
    onerror: (() => void) | null;
    onsuccess: (() => void) | null;
    onupgradeneeded: (() => void) | null;
    onblocked: (() => void) | null;
    error: unknown;
    result: IDBDatabase;
};

function buildOpenRequest(): { openRequest: TFakeOpenRequest; indexedDb: IDBFactory; closeCount: () => number } {
    let closeCount = 0;
    const openRequest: TFakeOpenRequest = {
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        onblocked: null,
        error: undefined,
        result: { close: () => { closeCount++; } } as unknown as IDBDatabase,
    };
    const indexedDb = { open: () => openRequest } as unknown as IDBFactory;
    return { openRequest, indexedDb, closeCount: () => closeCount };
}

const OIM_BLOCKED_FOR_TOO_LONG_MS = 5000;

describe('an open that stays blocked past the ceiling', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('closes the connection that arrives after it gave up, instead of orphaning it', async () => {
        const { openRequest, indexedDb, closeCount } = buildOpenRequest();
        const opening = oimOpenIndexedDb({ indexedDb, databaseName: 'orphan-db', databaseVersion: 2 });

        (openRequest.onblocked as () => void)();
        jest.advanceTimersByTime(OIM_BLOCKED_FOR_TOO_LONG_MS);

        await expect(opening).rejects.toThrow(/blocked for 5000 ms/);
        expect(closeCount()).toBe(0);

        (openRequest.onsuccess as () => void)();

        expect(closeCount()).toBe(1);
    });

    it('hands back the connection, and keeps it, when the block clears in time', async () => {
        const { openRequest, indexedDb, closeCount } = buildOpenRequest();
        const opening = oimOpenIndexedDb({ indexedDb, databaseName: 'orphan-db', databaseVersion: 2 });

        (openRequest.onblocked as () => void)();
        jest.advanceTimersByTime(OIM_BLOCKED_FOR_TOO_LONG_MS - 1);
        (openRequest.onsuccess as () => void)();

        await expect(opening).resolves.toBe(openRequest.result);
        expect(closeCount()).toBe(0);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('stops the clock at upgradeneeded, so a slow migration is not a block', async () => {
        const { openRequest, indexedDb, closeCount } = buildOpenRequest();
        const upgradedDatabases: IDBDatabase[] = [];
        const opening = oimOpenIndexedDb({
            indexedDb,
            databaseName: 'orphan-db',
            databaseVersion: 2,
            onUpgradeNeeded: database => { upgradedDatabases.push(database); },
        });

        (openRequest.onblocked as () => void)();
        jest.advanceTimersByTime(10);
        (openRequest.onupgradeneeded as () => void)();
        expect(upgradedDatabases).toEqual([openRequest.result]);
        expect(jest.getTimerCount()).toBe(0);

        jest.advanceTimersByTime(OIM_BLOCKED_FOR_TOO_LONG_MS * 12);
        (openRequest.onsuccess as () => void)();

        await expect(opening).resolves.toBe(openRequest.result);
        expect(closeCount()).toBe(0);
    });

    it('rejects with the request error and takes the ceiling down with it', async () => {
        const { openRequest, indexedDb } = buildOpenRequest();
        const opening = oimOpenIndexedDb({ indexedDb, databaseName: 'orphan-db', databaseVersion: 2 });

        (openRequest.onblocked as () => void)();
        openRequest.error = new Error('VersionError');
        (openRequest.onerror as () => void)();

        await expect(opening).rejects.toThrow('VersionError');
        expect(jest.getTimerCount()).toBe(0);
    });

    it('arms one timer however many times blocked fires', async () => {
        const { openRequest, indexedDb } = buildOpenRequest();
        const opening = oimOpenIndexedDb({ indexedDb, databaseName: 'orphan-db', databaseVersion: 2 });

        (openRequest.onblocked as () => void)();
        jest.advanceTimersByTime(OIM_BLOCKED_FOR_TOO_LONG_MS - 1);
        (openRequest.onblocked as () => void)();
        expect(jest.getTimerCount()).toBe(1);
        jest.advanceTimersByTime(1);

        await expect(opening).rejects.toThrow(/blocked for 5000 ms/);
    });
});
