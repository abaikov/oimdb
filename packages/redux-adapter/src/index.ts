// Core adapter
export { OIMDBReduxAdapter } from './core/OIMDBReduxAdapter';
export type { OIMDBReduxUpdateAction } from './core/OIMDBReduxAdapter';

// Enums
export { EOIMDBReduxReducerActionType } from './enums/EOIMDBReduxReducerActionType';

// Types
export type { TOIMDBReduxCollectionMapper } from './types/TOIMDBReduxCollectionMapper';
export type { TOIMDBReduxIndexMapper } from './types/TOIMDBReduxIndexMapper';
export type { TOIMDBReduxGlobalIndexMapper } from './types/TOIMDBReduxGlobalIndexMapper';
export type { TOIMDBReduxGlobalIndex } from './types/TOIMDBReduxGlobalIndex';
export type { TOIMDBReduxAdapterOptions } from './types/TOIMDBReduxAdapterOptions';
export type { TOIMDBReduxDefaultCollectionState } from './types/TOIMDBReduxDefaultCollectionState';
export type { TOIMDBReduxDefaultIndexState } from './types/TOIMDBReduxDefaultIndexState';
export type { TOIMDBReduxDefaultGlobalIndexState } from './types/TOIMDBReduxDefaultGlobalIndexState';
export type { TOIMDBReduxGlobalIndexReducerChildOptions } from './types/TOIMDBReduxGlobalIndexReducerChildOptions';
export type {
    TOIMDBReduxCollectionReducerChildOptions,
    TOIMDBReduxLinkedIndex,
} from './types/TOIMDBReduxCollectionReducerChildOptions';
export type { TOIMDBReduxIndexReducerChildOptions } from './types/TOIMDBReduxIndexReducerChildOptions';

// Default mappers (for advanced usage)
export {
    defaultCollectionMapper,
    defaultIndexMapper,
    defaultGlobalIndexMapper,
} from './core/OIMDBReduxDefaultMappers';

// Utils
export {
    findUpdatedInRecord,
    findUpdatedInArray,
} from './utils/findUpdatedEntities';
export type {
    TOIMDBReduxUpdatedEntitiesResult,
    TOIMDBReduxUpdatedArrayResult,
} from './utils/findUpdatedEntities';
export { arraysEqual, arraysEqualPk } from './utils/arraysEqual';
