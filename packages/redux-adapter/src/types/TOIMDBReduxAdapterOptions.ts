import { TOIMDBReduxCollectionMapper } from './TOIMDBReduxCollectionMapper';
import { TOIMDBReduxIndexMapper } from './TOIMDBReduxIndexMapper';

/**
 * Options for OIMDBReduxAdapter
 */
export type TOIMDBReduxAdapterOptions = {
    /**
     * Default mapper for collections (used when no mapper is provided)
     */
    defaultCollectionMapper?: TOIMDBReduxCollectionMapper<any, any, any>;
    /**
     * Default mapper for indexes (used when no mapper is provided)
     */
    defaultIndexMapper?: TOIMDBReduxIndexMapper<any, any, any>;
};
