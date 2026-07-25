import { IOIMAnyPersistResource } from '../interfaces/IOIMAnyPersistResource';

/**
 * One unit of work handed to `OIMPersistor.batchPersist`: a resource plus what
 * changed in it. `dirty === 'all'` forces a full-snapshot write; a key list is
 * a delta candidate (written as a delta only when the resource
 * `supportsDelta()`, otherwise it too becomes a full-snapshot write).
 *
 * Backend persistors that override `batchPersist` (e.g. the IndexedDB
 * transactional batch) consume this shape.
 */
export type TOIMPersistBatchItem<TPersistor> = {
    resource: IOIMAnyPersistResource<TPersistor>;
    dirty: 'all' | readonly unknown[];
};
