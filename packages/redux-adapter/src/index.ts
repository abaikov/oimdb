// Core adapter
export { OIMDBAdapter } from './core/OIMDBAdapter';
export type { OIMDBUpdateAction } from './core/OIMDBAdapter';

// Enums
export { EOIMDBReducerActionType } from './enum/EOIMDBReducerActionType';

// Types
export type { TOIMCollectionMapper } from './types/TOIMCollectionMapper';
export type { TOIMIndexMapper } from './types/TOIMIndexMapper';
export type { TOIMDBAdapterOptions } from './types/TOIMDBAdapterOptions';
export type { TOIMDefaultCollectionState } from './types/TOIMDefaultCollectionState';
export type { TOIMDefaultIndexState } from './types/TOIMDefaultIndexState';
export type {
    TOIMCollectionReducerChildOptions,
    TOIMLinkedIndex,
} from './types/TOIMCollectionReducerChildOptions';
export type { TOIMIndexReducerChildOptions } from './types/TOIMIndexReducerChildOptions';

// Default mappers (for advanced usage)
export {
    defaultCollectionMapper,
    defaultIndexMapper,
} from './core/OIMDefaultMappers';

// Utils
export {
    findUpdatedInRecord,
    findUpdatedInArray,
} from './utils/findUpdatedEntities';
export type {
    TOIMUpdatedEntitiesResult,
    TOIMUpdatedArrayResult,
} from './utils/findUpdatedEntities';
