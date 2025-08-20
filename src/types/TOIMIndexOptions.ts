import { TOIMIndexComparator } from './TOIMIndexComparator';
import { TOIMPk } from './TOIMPk';

/**
 * Configuration options for index instances */
export type TOIMIndexOptions<TPk extends TOIMPk> = {
    comparePks?: TOIMIndexComparator<TPk>;
};
