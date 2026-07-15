import type { OIMReactiveCollection } from '../core/OIMReactiveCollection';
import type { TOIMEntitySlotResolver } from './TOIMEntitySlot';
import type { TOIMIndexComparator } from './TOIMIndexComparator';
import type { TOIMPk } from './TOIMPk';
import type {
    TOIMDerivedEntityComparator,
    TOIMDerivedEntityOrderSelector,
} from './TOIMCollectionIndexOptions';

/**
 * Predicate deciding whether an entity belongs to a derived Global index.
 * Defaults to "the entity exists" (`item !== undefined`) when omitted.
 */
export type TOIMGlobalIndexFilter<TEntity extends object> = (
    entity: TEntity
) => boolean;

export type TOIMCollectionGlobalIndexArrayBasedOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    indexOptions?: { comparePks?: TOIMIndexComparator<TPk> };
} & (
    | { collection: OIMReactiveCollection<TEntity, TPk>; resolveSlot?: never }
    | { collection?: never; resolveSlot: TOIMEntitySlotResolver<TPk> }
);

export type TOIMCollectionGlobalIndexSetBasedOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    indexOptions?: { comparePks?: TOIMIndexComparator<TPk> };
} & (
    | { collection: OIMReactiveCollection<TEntity, TPk>; resolveSlot?: never }
    | { collection?: never; resolveSlot: TOIMEntitySlotResolver<TPk> }
);

export type TOIMDerivedCollectionGlobalIndexArrayBasedOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    /** Build initial state from existing collection slots. Defaults to true. */
    buildInitial?: boolean;
    /** Sort the list. Takes priority over `orderBy`. */
    compareEntities?: TOIMDerivedEntityComparator<TEntity>;
    /** Convenience ordering selector for common ordered-list cases. */
    orderBy?: TOIMDerivedEntityOrderSelector<TEntity>;
    /** Include predicate. Defaults to "entity exists". */
    filter?: TOIMGlobalIndexFilter<TEntity>;
    indexOptions?: { comparePks?: TOIMIndexComparator<TPk> };
};

export type TOIMDerivedCollectionGlobalIndexSetBasedOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    /** Build initial state from existing collection slots. Defaults to true. */
    buildInitial?: boolean;
    /** Include predicate. Defaults to "entity exists". */
    filter?: TOIMGlobalIndexFilter<TEntity>;
    indexOptions?: { comparePks?: TOIMIndexComparator<TPk> };
};

// Factory-facing (relations) option bundles — the collection binding is supplied
// by the factory, so these carry only the tuning knobs.
export type TOIMRelationsGlobalArrayIndexOptions<TPk extends TOIMPk> = {
    indexOptions?: { comparePks?: TOIMIndexComparator<TPk> };
};

export type TOIMRelationsGlobalSetIndexOptions<TPk extends TOIMPk> = {
    indexOptions?: { comparePks?: TOIMIndexComparator<TPk> };
};

export type TOIMRelationsDerivedGlobalArrayIndexOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = TOIMDerivedCollectionGlobalIndexArrayBasedOptions<TEntity, TPk>;

export type TOIMRelationsDerivedGlobalSetIndexOptions<
    TEntity extends object,
    TPk extends TOIMPk,
> = TOIMDerivedCollectionGlobalIndexSetBasedOptions<TEntity, TPk>;
