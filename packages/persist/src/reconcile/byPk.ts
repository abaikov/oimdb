import { TOIMPk } from '@oimdb/core';
import { TOIMCollectionPersistSnapshot } from '../types/TOIMCollectionPersistSnapshot';
import { TOIMPersistHydrateReconcile } from '../types/TOIMPersistHydrateReconcile';

/**
 * Builds a collection hydration reconciler from a per-entity resolver.
 *
 * The union of primary keys from `current` and `incoming` is walked once
 * (current order first, then incoming-only keys). For each pk:
 * - present in `incoming` → `resolve(current, incoming, pk)` decides the value;
 * - absent from `incoming` → the current value is kept untouched (this hydration
 *   source simply did not carry that entity).
 * A resolver returning `undefined` drops the entity from the result.
 *
 * Example — overlay locally-stored answers onto questions loaded from a server:
 * ```ts
 * .onHydrate(byPk((question, answer) =>
 *     question ? { ...question, answer: answer.answer } : answer
 * ))
 * ```
 */
export function byPk<TEntity, TPk extends TOIMPk>(
    resolve: (
        current: TEntity | undefined,
        incoming: TEntity,
        pk: TPk
    ) => TEntity | undefined
): TOIMPersistHydrateReconcile<TOIMCollectionPersistSnapshot<TPk, TEntity>> {
    return (current, incoming) => {
        const currentByPk = new Map<TPk, TEntity>();
        for (let i = 0; i < current.records.length; i++) {
            currentByPk.set(current.records[i].pk, current.records[i].value);
        }
        const incomingByPk = new Map<TPk, TEntity>();
        for (let i = 0; i < incoming.records.length; i++) {
            incomingByPk.set(incoming.records[i].pk, incoming.records[i].value);
        }

        const orderedPks: TPk[] = [];
        const seen = new Set<TPk>();
        const collect = (pk: TPk): void => {
            if (seen.has(pk)) return;
            seen.add(pk);
            orderedPks.push(pk);
        };
        for (let i = 0; i < current.records.length; i++) collect(current.records[i].pk);
        for (let i = 0; i < incoming.records.length; i++) collect(incoming.records[i].pk);

        const records: Array<{ pk: TPk; value: TEntity }> = [];
        for (let i = 0; i < orderedPks.length; i++) {
            const pk = orderedPks[i];
            const incomingValue = incomingByPk.get(pk);
            const value =
                incomingValue === undefined
                    ? currentByPk.get(pk)
                    : resolve(currentByPk.get(pk), incomingValue, pk);
            if (value !== undefined) records.push({ pk, value });
        }
        return { records };
    };
}
