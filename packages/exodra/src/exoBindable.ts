import type { TExoBindable } from '@exodra/reactivity-types';
import { OIMComputed, OIMSelector } from '@oimdb/core';
import type { TOIMExodraReadable } from './types/TOIMExodraReadable';
import { isExoReadable } from './isExoReadable';

/**
 * The one primitive. Turn anything OIMDB-shaped into a read-only Exodra bindable.
 *
 * ```ts
 * exoBindable(kit.select.byPk('u1'))                 // an OIMSelector
 * exoBindable(myComputed)                            // an OIMComputed
 * exoBindable(read, subscribe)                       // a raw pair — the escape hatch
 * exoBindable(selectedTeam, k => sel.byTeam(k))      // a REACTIVE key: repoints as the key moves
 * ```
 *
 * Every result is **lazy and ref-counted** (upstream is subscribed only while at least one downstream
 * subscriber exists, so cost is O(visible)) and **SSR-safe** (`getValue()` reads through to the store
 * and is valid with no subscription at all).
 *
 * There is no equality option, on purpose. Whoever owns the value owns the comparison:
 * `OIMSelector.areEqual` for selectors, `OIMComputed`'s `compare` for computeds, and for a raw pair
 * the `subscribe` callback is YOURS — compare in it and simply do not call `onChange`.
 */
export function exoBindable<T>(selector: OIMSelector<T>): TExoBindable<T>;
export function exoBindable<T>(computed: OIMComputed<T>): TExoBindable<T>;
export function exoBindable<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void
): TExoBindable<T>;
export function exoBindable<TKey, T>(
    key: TKey | TOIMExodraReadable<TKey>,
    makeSelector: (key: TKey) => OIMSelector<T>
): TExoBindable<T>;
export function exoBindable(
    source: unknown,
    second?: unknown
): TExoBindable<unknown> {
    if (second === undefined) {
        if (source instanceof OIMSelector) return fromSelector(source);
        if (source instanceof OIMComputed) return fromComputed(source);
        throw new Error(
            'exoBindable: single-argument form expects an OIMSelector or an OIMComputed. ' +
                'For anything else pass a (read, subscribe) pair.'
        );
    }
    if (typeof source === 'function') {
        return fromPair(
            source as () => unknown,
            second as (onChange: () => void) => () => void
        );
    }
    return fromKey(
        source,
        second as (key: unknown) => OIMSelector<unknown>
    );
}

/** Lazy, ref-counted adapter over a bare read/subscribe pair. Forwards every upstream emit. */
function fromPair<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void
): TExoBindable<T> {
    const subscribers = new Set<() => void>();
    let upstreamUnsub: (() => void) | undefined;
    // Many OIMDB sources (selector `watch`) fire synchronously on subscribe. `getValue` already
    // carries that value, so an emit during the subscription window is a no-op, not a change.
    let priming = false;

    const onUpstreamChange = () => {
        if (priming) return;
        // Snapshot so a subscriber may (un)subscribe during notification without skipping/looping.
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    return {
        getValue: read,
        subscribe(update) {
            subscribers.add(update);
            if (subscribers.size === 1) {
                priming = true;
                upstreamUnsub = subscribe(onUpstreamChange);
                priming = false;
            }
            return () => {
                subscribers.delete(update);
                if (subscribers.size === 0) {
                    upstreamUnsub?.();
                    upstreamUnsub = undefined;
                }
            };
        },
    };
}

function fromSelector<T>(selector: OIMSelector<T>): TExoBindable<T> {
    return fromPair(
        () => selector.getValue(),
        onChange => selector.watch(() => onChange())
    );
}

function fromComputed<T>(computed: OIMComputed<T>): TExoBindable<T> {
    return fromPair(
        () => computed.get(),
        onChange => computed.updateEventEmitter.subscribeOnKey('value', onChange)
    );
}

/**
 * Reactive-key variant. The pointed-at selector lives only while subscribed, because repointing is
 * driven by the key subscription — so an unsubscribed `getValue()` resolves the CURRENT key instead
 * of answering for whichever one was current at construction. A never-watched selector holds no
 * subscriptions, so that throwaway is plain garbage.
 */
function fromKey<TKey, T>(
    key: TKey | TOIMExodraReadable<TKey>,
    makeSelector: (key: TKey) => OIMSelector<T>
): TExoBindable<T> {
    if (!isExoReadable<TKey>(key)) return fromSelector(makeSelector(key));

    const keyBindable = key;
    const subscribers = new Set<() => void>();
    let selector: OIMSelector<T> | undefined;
    let selectorUnsub: (() => void) | undefined;
    let keyUnsub: (() => void) | undefined;
    let priming = false;

    const notify = () => {
        if (priming) return;
        for (const subscriber of Array.from(subscribers)) {
            if (subscribers.has(subscriber)) subscriber();
        }
    };

    const pointAtCurrentKey = () => {
        selector = makeSelector(keyBindable.getValue());
        priming = true;
        selectorUnsub = selector.watch(() => notify());
        priming = false;
    };

    return {
        getValue: () =>
            (selector ?? makeSelector(keyBindable.getValue())).getValue(),
        subscribe(update) {
            subscribers.add(update);
            if (subscribers.size === 1) {
                pointAtCurrentKey();
                keyUnsub = keyBindable.subscribe(() => {
                    selectorUnsub?.();
                    pointAtCurrentKey();
                    notify(); // emit once for the newly pointed-at value
                });
            }
            return () => {
                subscribers.delete(update);
                if (subscribers.size === 0) {
                    selectorUnsub?.();
                    selectorUnsub = undefined;
                    selector = undefined;
                    keyUnsub?.();
                    keyUnsub = undefined;
                }
            };
        },
    };
}
