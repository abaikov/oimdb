import { TOIMIndexComparator } from './TOIMIndexComparator';
import { TOIMPk } from './TOIMPk';
import { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import { TOIMEntitySlotResolver } from './TOIMEntitySlot';

/**
 * Configuration options for Set-based index instances */
export type TOIMIndexOptionsSetBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStoreSetBased<TIndexKey, TPk>;
    resolveSlot?: TOIMEntitySlotResolver<TPk>;
};

/**
 * Configuration options for Array-based index instances */
export type TOIMIndexOptionsArrayBased<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    comparePks?: TOIMIndexComparator<TPk>;
    store?: OIMIndexStoreArrayBased<TIndexKey, TPk>;
    resolveSlot?: TOIMEntitySlotResolver<TPk>;
};

/**
 * @deprecated Use TOIMIndexOptionsSetBased or TOIMIndexOptionsArrayBased instead
 * Configuration options for index instances */
export type TOIMIndexOptions<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = TOIMIndexOptionsSetBased<TIndexKey, TPk>;
