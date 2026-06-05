/**
 * Hydration reconciler. Called once per `hydrate()`, per resource, to combine
 * the snapshot just loaded with whatever the source already holds.
 *
 * - `current`  — what the collection/object/index holds right now (e.g. an SSR
 *   pre-state already populated, or data from an earlier hydration).
 * - `incoming` — the snapshot THIS hydration brought in (e.g. from IndexedDB).
 *
 * Always read it as "lay `incoming` onto `current`". When no reconciler is set
 * the engine uses `incoming` verbatim — i.e. a plain replace (backward compatible).
 */
export type TOIMPersistHydrateReconcile<TSnapshot> = (
    current: TSnapshot,
    incoming: TSnapshot
) => TSnapshot;
