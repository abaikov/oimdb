// Core factory
export { OIMDBReducerFactory } from './core/OIMDBReducerFactory';
export type { OIMDBUpdateAction } from './core/OIMDBReducerFactory';

// Enums
export { EOIMDBReducerActionType } from './enum/EOIMDBReducerActionType';

// Types
export type { TOIMCollectionMapper } from './types/TOIMCollectionMapper';
export type { TOIMIndexMapper } from './types/TOIMIndexMapper';
export type { TOIMDBReducerFactoryOptions } from './types/TOIMDBReducerFactoryOptions';
export type { TOIMDefaultCollectionState } from './types/TOIMDefaultCollectionState';
export type { TOIMDefaultIndexState } from './types/TOIMDefaultIndexState';
export type { TOIMCollectionReducerChildOptions } from './types/TOIMCollectionReducerChildOptions';

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
