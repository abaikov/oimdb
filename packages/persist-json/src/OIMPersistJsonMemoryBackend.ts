import type { TOIMPersistRecord } from '@oimdb/persist';
import { OIMPersistMemoryBackend } from '@oimdb/persist-memory';
import type { TOIMPersistJsonMemoryBackendOptions } from './types/TOIMPersistJsonMemoryBackendOptions';
import type { TOIMPersistJsonDump } from './types/TOIMPersistJsonDump';

export class OIMPersistJsonMemoryBackend extends OIMPersistMemoryBackend {
    public constructor(persistJsonMemoryBackendOptions: TOIMPersistJsonMemoryBackendOptions = {}) {
        super();
        const initialPersistJsonDump = persistJsonMemoryBackendOptions.initialPersistJsonDump;
        if (initialPersistJsonDump === undefined) return;
        for (const [storageKey, snapshotValue] of Object.entries(initialPersistJsonDump.snapshotValues)) {
            this.writeSnapshotValue(storageKey, snapshotValue);
        }
        for (const [storageKey, records] of Object.entries(initialPersistJsonDump.recordsByStorageKey)) {
            this.writeRecords(storageKey, { records });
        }
    }

    public dehydrate(): TOIMPersistJsonDump {
        const snapshotValues: Record<string, unknown> = {};
        for (const [storageKey, snapshotValue] of this.snapshotValueByStorageKey) snapshotValues[storageKey] = snapshotValue;
        const recordsByStorageKey: Record<string, TOIMPersistRecord<unknown, unknown>[]> = {};
        for (const [storageKey, entityByKey] of this.entityByKeyByStorageKey) {
            recordsByStorageKey[storageKey] = Array.from(entityByKey, ([key, entity]) => ({ key, entity }));
        }
        return { snapshotValues, recordsByStorageKey };
    }
}
