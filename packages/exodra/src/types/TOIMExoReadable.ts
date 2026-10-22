export type TOIMExoReadable<TValue> = {
    getValue(): TValue;
    subscribe(update: () => void): () => void;
};
