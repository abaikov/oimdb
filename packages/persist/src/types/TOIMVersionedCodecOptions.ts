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
