import { TOIMCollectionMapper } from './TOIMCollectionMapper';
import { TOIMIndexMapper } from './TOIMIndexMapper';

/**
 * Options for OIMDBReducerFactory
 */
export type TOIMDBReducerFactoryOptions = {
    /**
     * Default mapper for collections (used when no mapper is provided)
     */
    defaultCollectionMapper?: TOIMCollectionMapper<any, any, any>;
    /**
     * Default mapper for indexes (used when no mapper is provided)
     */
    defaultIndexMapper?: TOIMIndexMapper<any, any, any>;
};
