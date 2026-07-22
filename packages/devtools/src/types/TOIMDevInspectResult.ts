export type TOIMDevIndexInfo = {
    keyCount: number;
    keys: unknown[];
};

export type TOIMDevCollectionInfo = {
    count: number;
    samplePks: unknown[];
    sampleEntity: unknown;
    entities: unknown[];
    indexes: Record<string, TOIMDevIndexInfo>;
    relations: Record<string, string>;
    description?: string;
};

export type TOIMDevComputedDepInfo = {
    /** Registered name of the dep source, or null if not registered in devtools */
    name: string | null;
};

export type TOIMDevComputedInfo = {
    isReady: boolean;
    needsRecompute: boolean;
    currentValue: unknown;
    deps: TOIMDevComputedDepInfo[];
};

export type TOIMDevFlushRecord = {
    time: number;
    /** entity count per collection at the time of flush */
    counts: Record<string, number>;
};

export type TOIMDevFlushErrorRecord = {
    time: number;
    /** String form of the value a queue task threw during flush. */
    message: string;
};

export type TOIMDevInspectResult = {
    collections: Record<string, TOIMDevCollectionInfo>;
    computeds: Record<string, TOIMDevComputedInfo>;
    history: TOIMDevFlushRecord[];
    /** Errors thrown by tasks during flush, most recent first. */
    errors: TOIMDevFlushErrorRecord[];
};
