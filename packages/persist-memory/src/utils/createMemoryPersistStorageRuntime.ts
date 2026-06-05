import { TOIMMemoryPersistStorage } from '../types/TOIMMemoryPersistStorage';

export function createMemoryPersistStorageRuntime(): TOIMMemoryPersistStorage {
    return {
        entries: new Map(),
        recordBuckets: new Map(),
    };
}
