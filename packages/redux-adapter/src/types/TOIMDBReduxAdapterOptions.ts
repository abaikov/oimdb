import { TOIMDBReduxCollectionMapper } from './TOIMDBReduxCollectionMapper';
import { TOIMDBReduxIndexMapper } from './TOIMDBReduxIndexMapper';
import { TOIMDBReduxGlobalIndexMapper } from './TOIMDBReduxGlobalIndexMapper';

/**
 * Options for OIMDBReduxAdapter
 *
 * The three `any`s below are the one place in this package where the rule is
 * waived, and it is a variance limit rather than laziness. A *default* mapper has
 * to be callable for EVERY collection/index registered on the adapter, but a
 * mapper is a function type, so under `strictFunctionTypes` its parameters are
 * contravariant: a `TOIMDBReduxCollectionMapper<User, string, S>` is not
 * assignable to one widened over `unknown`/`object`, and a generic signature
 * `<TEntity, …>(…) => TState` is unimplementable (nothing can produce an
 * arbitrary `TState`). `any` in the type argument is what lets a concrete mapper
 * be stored here; the adapter re-narrows at each call site.
 */
export type TOIMDBReduxAdapterOptions = {
    /**
     * Default mapper for collections (used when no mapper is provided)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the variance note above
    defaultCollectionMapper?: TOIMDBReduxCollectionMapper<any, any, any>;
    /**
     * Default mapper for indexes (used when no mapper is provided)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the variance note above
    defaultIndexMapper?: TOIMDBReduxIndexMapper<any, any, any>;
    /**
     * Default mapper for keyless "Global" indexes (used when no mapper is provided)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the variance note above
    defaultGlobalIndexMapper?: TOIMDBReduxGlobalIndexMapper<any, any>;
};
