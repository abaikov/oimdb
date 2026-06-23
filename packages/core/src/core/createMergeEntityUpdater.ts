import { TOIMEntityUpdater } from '../types/TOIMEntityUpdater';

/**
 * Default entity updater: shallow-merges the patch into a NEW object
 * (`{ ...prev, ...draft }`). Each update produces a fresh entity reference, which
 * reference-comparison bindings (React's `Object.is` / `useSyncExternalStore`,
 * `React.memo`, prev/next diffing, time-travel) need to detect a change.
 *
 * The new-object allocation is the biggest per-update data-layer cost; for
 * update-heavy, subscription-driven readers use {@link createInPlaceEntityUpdater}
 * instead.
 */
export function createMergeEntityUpdater<
    TEntity extends object,
>(): TOIMEntityUpdater<TEntity> {
    return (draft, prev) => ({ ...prev, ...draft });
}
