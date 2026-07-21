/**
 * Options shared by every read-only bindable the bridge produces.
 *
 * - `equals` suppresses empty emits. Set/array reads in oimdb allocate a fresh container each call,
 *   so a reference compare is useless — pass a content compare when the source returns collections.
 *   Defaults to `Object.is` (correct for immutable entities, where each upsert yields a new ref).
 * - `alwaysNotify` forwards every upstream change unconditionally (`equals: () => false`). Use it
 *   with in-place entity updaters, where the entity reference is stable and `Object.is` would
 *   otherwise report "equal" and swallow the update, leaving the UI stale.
 */
export type TOIMExodraBindableOptions<TValue> = {
    equals?: (a: TValue, b: TValue) => boolean;
    alwaysNotify?: boolean;
};
