import { TOIMPk } from '@oimdb/core';

export type TOIMMemoryPersistStorage = {
    entries: Map<string, unknown>;
    recordBuckets: Map<string, Map<TOIMPk, unknown>>;
};
