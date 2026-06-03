import { TOIMPersistCodec } from '../types/TOIMPersistResource';

export type TOIMVersionedPersistedShape = {
    __v: number;
    data: unknown;
};

export type TOIMVersionedCodecOptions<TSource, TPersisted> = {
    /** Current schema version. Must be a positive integer and must only increase. */
    version: number;
    /**
     * Migration functions keyed by the version they produce.
     * Example: `{ 1: (v0data) => v1data, 2: (v1data) => v2data }`.
     * Applied in ascending key order when the stored version is lower than current.
     */
    migrations: Record<number, (data: unknown) => unknown>;
    /** Optional transform from TSource to TPersisted before version envelope is applied. */
    encode?: (source: TSource) => TPersisted;
    /** Optional transform from TPersisted back to TSource after migrations are applied. */
    decode?: (persisted: TPersisted) => TSource;
};

export function createVersionedCodec<TSource, TPersisted = TSource>(
    options: TOIMVersionedCodecOptions<TSource, TPersisted>
): TOIMPersistCodec<TSource, TOIMVersionedPersistedShape> {
    const { version, migrations, encode, decode } = options;

    return {
        encode(source: TSource): TOIMVersionedPersistedShape {
            const data = encode ? encode(source) : source;
            return { __v: version, data };
        },

        decode(wrapped: TOIMVersionedPersistedShape): TSource {
            const storedVersion =
                wrapped && typeof wrapped === 'object' && '__v' in wrapped
                    ? (wrapped as TOIMVersionedPersistedShape).__v
                    : 0;
            const rawData =
                wrapped && typeof wrapped === 'object' && 'data' in wrapped
                    ? (wrapped as TOIMVersionedPersistedShape).data
                    : wrapped;

            const migrationKeys = Object.keys(migrations)
                .map(Number)
                .filter((k) => k > storedVersion && k <= version)
                .sort((a, b) => a - b);

            let data: unknown = rawData;
            for (const key of migrationKeys) {
                data = migrations[key](data);
            }

            return decode ? decode(data as TPersisted) : (data as unknown as TSource);
        },
    };
}
