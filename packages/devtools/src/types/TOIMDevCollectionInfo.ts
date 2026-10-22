import type { TOIMDevIndexInfo } from './TOIMDevIndexInfo';

export type TOIMDevCollectionInfo = {
    count: number;
    samplePks: unknown[];
    sampleEntity: unknown;
    entities: unknown[];
    indexes: Record<string, TOIMDevIndexInfo>;
    relations: Record<string, string>;
    description?: string | undefined;
};
