import { TOIMIndexComparator } from './TOIMIndexComparator';
import { TOIMPk } from './TOIMPk';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';

/**
 * Configuration options for Set-based index instances */
export type TOIMIndexOptionsSetBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStoreSetBased<TIndexKey, TPk>;
};

/**
 * Configuration options for Array-based index instances */
export type TOIMIndexOptionsArrayBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStoreArrayBased<TIndexKey, TPk>;
};

