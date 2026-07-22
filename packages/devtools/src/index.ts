import { OIMDevRegistry } from './core/OIMDevRegistry';

export { OIMDevRegistry };
export type { IOIMDevCollectionLike } from './interfaces/IOIMDevCollectionLike';
export type { IOIMDevComputedLike } from './interfaces/IOIMDevComputedLike';
export type { IOIMDevIndexLike } from './interfaces/IOIMDevIndexLike';
export type { TOIMDevCollectionOptions } from './types/TOIMDevCollectionOptions';
export type {
    TOIMDevCollectionInfo,
    TOIMDevComputedDepInfo,
    TOIMDevComputedInfo,
    TOIMDevFlushErrorRecord,
    TOIMDevFlushRecord,
    TOIMDevIndexInfo,
    TOIMDevInspectResult,
} from './types/TOIMDevInspectResult';

export const registry = new OIMDevRegistry();
