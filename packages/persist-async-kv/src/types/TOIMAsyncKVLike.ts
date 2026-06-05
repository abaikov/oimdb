/**
 * Minimal asynchronous key-value storage contract used by the async KV backend.
 *
 * Modelled on React Native's `AsyncStorage`, so `AsyncStorage` satisfies this
 * type directly. The three core operations are required; the batch operations
 * are optional and, when present, are used for one-shot batched writes.
 */
export type TOIMAsyncKVLike = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    // Optional batch ops (AsyncStorage has them). Used for one-shot batched writes.
    multiGet?(
        keys: string[]
    ): Promise<ReadonlyArray<readonly [string, string | null]>>;
    multiSet?(keyValuePairs: Array<[string, string]>): Promise<void>;
    multiRemove?(keys: string[]): Promise<void>;
};
