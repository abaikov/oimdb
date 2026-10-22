export type TOIMPersistKeyValueSerializer = {
    serialize(value: unknown): string;
    deserialize(item: string): unknown;
};
