import { TOIMIndexComparator } from './TOIMIndexComparator';
import { TOIMPk } from './TOIMPk';
import { OIMIndexStore } from '../abstract/OIMIndexStore';

/**
 * Configuration options for index instances */
export type TOIMIndexOptions<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStore<TIndexKey, TPk>;
};
