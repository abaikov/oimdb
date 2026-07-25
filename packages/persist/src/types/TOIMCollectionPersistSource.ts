import { EOIMCollectionEventType, TOIMKey } from '@oimdb/core';
import { TOIMEmitter } from './TOIMEmitter';

export type TOIMCollectionPersistSource<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    // `TEntity` is inferred solely from the covariant `getAll()` so that a
    // concrete `OIMCollection<TEntity>` — whose `upsertMany`/`selectPk` accept
    // the wider `TEntity | Partial<TEntity>` — does not widen the inferred
    // entity to that union. `NoInfer` keeps the contravariant positions as
    // assignability checks only, which makes `.onHydrate(byPk<TEntity, …>(…))`
    // type-check with explicit generics.
    selectPk(entity: NoInfer<TEntity>): TPk;
    getAll(): TEntity[];
    clear(): void;
    upsertMany(entities: NoInfer<TEntity>[]): unknown;
    /**
     * Read a single entity by PK. Optional here (a bare persist source need not
     * provide it), but required — together with `removeManyByPks` and
     * `subscribeOnAnyUpdate` — for the adapter to expose its keyed/delta
     * capability. `OIMCollection`/`OIMReactiveCollection` both provide it.
     */
    getOneByPk?: (pk: TPk) => TEntity | undefined;
    /** Remove entities by PK. Needed for the keyed capability's `applyDelta`. */
    removeManyByPks?: (pks: readonly TPk[]) => void;
    /**
     * Queue-integrated subscription: fires once per queue flush with the
     * changed PKs. Used by OIMReactiveCollection. Preferred over `emitter`
     * when available — no need for a separate dirty flag since the reactive
     * collection already accumulates changes internally. Also the source of the
     * changed keys that drive delta persistence.
     */
    subscribeOnAnyUpdate?: (
        handler: (pks: readonly TPk[]) => void
    ) => () => void;
    /** Raw synchronous emitter — fallback for non-reactive OIMCollection. */
    emitter?: TOIMEmitter<typeof EOIMCollectionEventType.UPDATE>;
};
