import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';

/**
 * Entity updater that mutates the existing entity in place instead of building a
 * new merged object. It skips the per-update allocation/copy of the default
 * merge updater (`{ ...prev, ...draft }`), which is the single biggest data-layer
 * cost on update-heavy workloads.
 *
 * Pair it with a signal-driven binding (re-read the entity on the keyed
 * notification, e.g. `@oimdb/react`'s `*Signal` hooks): since the stored entity
 * reference stays stable across updates, reference-comparison bindings
 * (React's `Object.is` / `useSyncExternalStore`, `React.memo` on entities,
 * prev/next diffing, time-travel) will NOT see the change. Use only where every
 * reader is subscription-driven.
 */
export function createInPlaceEntityUpdater<
    TEntity extends object,
>(): TOIMEntityUpdater<TEntity> {
    return (draft, prev) => Object.assign(prev, draft);
}
