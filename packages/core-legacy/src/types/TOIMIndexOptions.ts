import type { TOIMKey } from './TOIMKey';
import type { TOIMIndexComparator } from './TOIMIndexComparator';
import type { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import type { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';

/**
 * Configuration options for Set-based index instances */
export type TOIMIndexOptionsSetBased<
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStoreSetBased<TIndexKey, TPk>;
};

/**
 * Configuration options for Array-based index instances */
export type TOIMIndexOptionsArrayBased<
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStoreArrayBased<TIndexKey, TPk>;
};

