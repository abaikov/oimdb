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

export type TOIMDevInspectResult = {
    collections: Record<string, TOIMDevCollectionInfo>;
    computeds: Record<string, TOIMDevComputedInfo>;
    history: TOIMDevFlushRecord[];
};
