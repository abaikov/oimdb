import type { TExoBindable } from '@exodra/reactivity';
import type { TOIMKey } from '@oimdb/core';
import { keyedChildren } from './keyedChildren';

/**
 * The headline list primitive: an ordered pk source → identity-stable rows keyed by pk. Each row
 * gets its OWN entity bindable (via `bindEntity`), so it is self-updating and focus-safe; the row
 * schema is cached per pk, so a field edit is a reconcile no-op while the row's inner bindable
 * updates in place. Subscriptions are O(visible): one per rendered row plus the order source.
 *
 * `order` is an ordered pk bindable (e.g. one wrapping `OIMReactiveIndexArrayBased.getPksByKey`);
 * `bindEntity` is typically `pk => bindSelectors(selectors).byPk(pk)`.
 */
export function entityRows<TEntity, TPk extends TOIMKey, TSchema>(
    order: TExoBindable<readonly TPk[]>,
    bindEntity: (pk: TPk) => TExoBindable<TEntity | undefined>,
    render: (entity: TExoBindable<TEntity | undefined>, pk: TPk) => TSchema
): TExoBindable<readonly TSchema[]> {
    return keyedChildren(order, {
        key: pk => pk,
        render: pk => render(bindEntity(pk), pk),
    });
}
