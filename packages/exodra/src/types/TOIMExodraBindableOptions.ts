/**
 * Options for the raw `fromOimdb` adapter — the ONLY layer that owns an equality policy.
 *
 * `equals` suppresses no-op emits when the wrapped source has no dedup of its own (a bare
 * `read`/`subscribe` pair over an event emitter). Defaults to `Object.is`, which is correct for
 * immutable entities, where each upsert yields a new reference. Two cases need an explicit value:
 *
 * - the source returns a freshly allocated container per read (set/array) — pass a content compare,
 *   a reference compare would never suppress anything;
 * - in-place entity updaters, where the reference is stable and `Object.is` would report "equal" and
 *   swallow the update, leaving the UI stale — pass `equals: () => false` to forward unconditionally.
 *
 * The selector/computed adapters (`fromSelector`, `fromSelectorFactory`, `fromComputed`,
 * `bindSelectors`) take NO options: `OIMSelector.areEqual` and `OIMComputed`'s `compare` already own
 * the policy, and the lower layer wins — a filter here could only reject what core already passed.
 */
export type TOIMExodraBindableOptions<TValue> = {
    equals?: (a: TValue, b: TValue) => boolean;
};
