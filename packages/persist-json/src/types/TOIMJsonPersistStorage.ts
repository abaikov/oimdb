/**
 * Storage shape for the JSON backend: a single plain, JSON-serializable
 * object whose keys are the per-resource `storageKey`s. The whole `data`
 * object can be `JSON.stringify`-ed on the server and fed back on the client.
 */
export type TOIMJsonPersistStorage = {
    data: Record<string, unknown>;
};
