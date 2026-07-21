import { TOIMKey } from './TOIMKey';
import type { OIMIndexStoreArrayBased } from '../abstract/OIMIndexStoreArrayBased';
import type { OIMIndexStoreSetBased } from '../abstract/OIMIndexStoreSetBased';
import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { OIMCollectionIndexManualOrderedArrayBased } from '../core/OIMCollectionIndexManualOrderedArrayBased';
import type { TOIMEntitySlotGetter } from './TOIMEntitySlot';
import type { TOIMIndexComparator } from './TOIMIndexComparator';
import type { TOIMPk } from './TOIMPk';
import type { TOIMKeyPath } from './TOIMKeyPath';

export type TOIMCollectionIndexSetBasedOptions<
    TEntity extends object,
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          getSlot?: never;
      }
    | {
          collection?: never;
          getSlot: TOIMEntitySlotGetter<TPk>;
      }
);

export type TOIMCollectionIndexArrayBasedOptions<
    TEntity extends object,
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          getSlot?: never;
      }
    | {
          collection?: never;
          getSlot: TOIMEntitySlotGetter<TPk>;
      }
);

export type TOIMCollectionOrderedIndexOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> =
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          getSlot?: never;
      }
    | {
          collection?: never;
          getSlot: TOIMEntitySlotGetter<TPk>;
      };

export type TOIMCollectionOrderedListCommandStreamOptions<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object,
> = {
    index?: OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>;
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          getSlot?: never;
      }
    | {
          collection?: never;
          getSlot: TOIMEntitySlotGetter<TPk>;
      }
);

export type TOIMRelationsSetIndexOptions<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TKey, TPk>;
    };
};

export type TOIMRelationsArrayIndexOptions<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TKey, TPk>;
    };
};

/**
 * Options for a composite (trie-backed) Set-based index. Its key is a
 * `TOIMKeyPath` — an arbitrary-length tuple of primitive segments — looked up by
 * content in O(arity). The store defaults to `OIMIndexStoreTrieDrivenSetBased`.
 */
export type TOIMCollectionIndexCompositeSetBasedOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TOIMKeyPath, TPk>;
    };
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          getSlot?: never;
      }
    | {
          collection?: never;
          getSlot: TOIMEntitySlotGetter<TPk>;
      }
);

export type TOIMRelationsCompositeSetIndexOptions<TPk extends TOIMKey> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreSetBased<TOIMKeyPath, TPk>;
    };
};

/**
 * Options for a composite (trie-backed) Array-based (ordered) index. Its key is
 * a `TOIMKeyPath`, looked up by content in O(arity). The store defaults to
 * `OIMIndexStoreTrieDrivenArrayBased`.
 */
export type TOIMCollectionIndexCompositeArrayBasedOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TOIMKeyPath, TPk>;
    };
} & (
    | {
          collection: OIMReactiveCollection<TEntity, TPk>;
          getSlot?: never;
      }
    | {
          collection?: never;
          getSlot: TOIMEntitySlotGetter<TPk>;
      }
);

export type TOIMRelationsCompositeArrayIndexOptions<TPk extends TOIMKey> = {
    indexOptions?: {
        comparePks?: TOIMIndexComparator<TPk>;
        store?: OIMIndexStoreArrayBased<TOIMKeyPath, TPk>;
    };
};

export type TOIMRelationsOrderedListOptions<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object,
> = {
    index?: OIMCollectionIndexManualOrderedArrayBased<TKey, TPk, TEntity>;
};

export type TOIMDerivedIndexKeySelector<
    TEntity extends object,
    TKey extends TOIMKey,
> = (entity: TEntity) => TKey | readonly TKey[] | undefined | null;

export type TOIMDerivedCollectionIndexSetBasedOptions<
    TEntity extends object,
    TKey extends TOIMKey,
    TPk extends TOIMKey,
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
    TKey extends TOIMKey,
    TPk extends TOIMKey,
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
    TKey extends TOIMKey,
    TPk extends TOIMKey,
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
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = Omit<
    TOIMDerivedCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>,
    'selectIndexKeys'
>;
