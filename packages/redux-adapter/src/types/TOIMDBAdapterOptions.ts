import { TOIMCollectionMapper } from './TOIMCollectionMapper';
import { TOIMIndexMapper } from './TOIMIndexMapper';

/**
 * Options for OIMDBAdapter
 */
export type TOIMDBAdapterOptions = {
    /**
     * Default mapper for collections (used when no mapper is provided)
     */
    defaultCollectionMapper?: TOIMCollectionMapper<any, any, any>;
    /**
     * Default mapper for indexes (used when no mapper is provided)
     */
    defaultIndexMapper?: TOIMIndexMapper<any, any, any>;
};
