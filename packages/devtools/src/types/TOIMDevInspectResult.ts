import type { TOIMDevCollectionInfo } from './TOIMDevCollectionInfo';
import type { TOIMDevComputedInfo } from './TOIMDevComputedInfo';
import type { TOIMDevFlushErrorRecord } from './TOIMDevFlushErrorRecord';
import type { TOIMDevFlushRecord } from './TOIMDevFlushRecord';

export type TOIMDevInspectResult = {
    collections: Record<string, TOIMDevCollectionInfo>;
    computeds: Record<string, TOIMDevComputedInfo>;
    history: TOIMDevFlushRecord[];
    errors: TOIMDevFlushErrorRecord[];
};
