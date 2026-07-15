import type { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import type { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMCollectionIndexManualOrderedArrayBased } from '../core/OIMCollectionIndexManualOrderedArrayBased';
import type { TOIMEntitySlotResolver } from './TOIMEntitySlot';
import type { TOIMIndexComparator } from './TOIMIndexComparator';
import type { TOIMPk } from './TOIMPk';

export type TOIMCollectionIndexSetBasedOptions<
    TEntity extends object,
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          resolveSlot?: never;
      }
    | {
          collection?: never;
          resolveSlot: TOIMEntitySlotResolver<TPk>;
      }
);

export type TOIMCollectionIndexArrayBasedOptions<
    TEntity extends object,
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          resolveSlot?: never;
      }
    | {
          collection?: never;
          resolveSlot: TOIMEntitySlotResolver<TPk>;
      }
);

export type TOIMCollectionOrderedIndexOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> =
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          resolveSlot?: never;
      }
    | {
          collection?: never;
          resolveSlot: TOIMEntitySlotResolver<TPk>;
      };

export type TOIMCollectionOrderedListCommandStreamOptions<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object,
> = {
    index?: OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>;
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          resolveSlot?: never;
      }
    | {
          collection?: never;
          resolveSlot: TOIMEntitySlotResolver<TPk>;
      }
);

export type TOIMRelationsSetIndexOptions<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
};

export type TOIMRelationsArrayIndexOptions<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
};

export type TOIMRelationsOrderedListOptions<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TEntity extends object,
> = {
    index?: OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>;
};

export type TOIMDerivedIndexKeySelector<
    TEntity extends object,
    TKey extends TOIMPk,
> = (entity: TEntity) => TKey | readonly TKey[] | undefined | null;

export type TOIMDerivedCollectionIndexSetBasedOptions<
    TEntity extends object,
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    selectIndexKeys: TOIMDerivedIndexKeySelector<TEntity, TKey>;
    /**
     * Build initial index state from existing collection slots.
     * Defaults to true.
     */
    buildInitial?: boolean;
    indexOptions?: TOIMCollectionIndexSetBasedOptions<
        TEntity,
        TKey,
        TPk
    >['indexOptions'];
};

export type TOIMRelationsDerivedSetIndexOptions<
    TEntity extends object,
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = Omit<
    TOIMDerivedCollectionIndexSetBasedOptions<TEntity, TKey, TPk>,
    'selectIndexKeys'
>;

export type TOIMDerivedEntityOrderValue = string | number | bigint | boolean;

export type TOIMDerivedEntityOrderSelector<TEntity extends object> = (
    entity: TEntity
) => TOIMDerivedEntityOrderValue;

export type TOIMDerivedEntityComparator<TEntity extends object> = (
    a: TEntity,
    b: TEntity
) => number;

export type TOIMDerivedCollectionIndexArrayBasedOptions<
    TEntity extends object,
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    selectIndexKeys: TOIMDerivedIndexKeySelector<TEntity, TKey>;
    /**
     * Build initial index state from existing collection slots.
     * Defaults to true.
     */
    buildInitial?: boolean;
    /**
     * Sort entities inside each derived index key. Takes priority over orderBy.
     */
    compareEntities?: TOIMDerivedEntityComparator<TEntity>;
    /**
     * Convenience ordering selector for common ordered-list cases.
     */
    orderBy?: TOIMDerivedEntityOrderSelector<TEntity>;
    indexOptions?: TOIMCollectionIndexArrayBasedOptions<
        TEntity,
        TKey,
        TPk
    >['indexOptions'];
};

export type TOIMRelationsDerivedArrayIndexOptions<
    TEntity extends object,
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = Omit<
    TOIMDerivedCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>,
    'selectIndexKeys'
>;
