/**
 * Payload for index update events containing the keys that were modified */
export type TOIMIndexUpdatePayload<TKey> = {
    keys: readonly TKey[];
};
