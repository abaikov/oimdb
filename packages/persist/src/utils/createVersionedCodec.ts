import { TOIMPersistCodec } from '../types/TOIMPersistCodec';
import { TOIMVersionedCodecOptions } from '../types/TOIMVersionedCodecOptions';
import { TOIMVersionedPersistedShape } from '../types/TOIMVersionedPersistedShape';

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
