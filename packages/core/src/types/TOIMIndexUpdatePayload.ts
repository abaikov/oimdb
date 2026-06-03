/**
 * Payload for index update events containing the keys that were modified */
export interface TOIMIndexUpdatePayload<TKey> {
    keys: readonly TKey[];
}
