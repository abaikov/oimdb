import type { TExoBindable } from '@exodra/reactivity-types';

export function exoSource<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void
): TExoBindable<T> {
    type TOIMSubscription = { handler: () => void; live: boolean };

    const subscribers: TOIMSubscription[] = [];
    let upstreamUnsub: (() => void) | undefined;
    // An emit during the subscription window is a no-op: `getValue` already carries it.
    let priming = false;

    const onUpstreamChange = () => {
        if (priming) return;
        // The snapshot below only exists so a subscriber may (un)subscribe DURING
        // notification; with exactly one there is nothing to skip or revisit.
        if (subscribers.length === 1) {
            const only = subscribers[0];
            if (only.live) only.handler();
            return;
        }
        for (const subscription of subscribers.slice()) {
            if (subscription.live) subscription.handler();
        }
    };

    /** Twice is harmless and has to be: a second removal would take somebody else's entry. */
    const deleteSubscription = (subscription: TOIMSubscription): void => {
        if (!subscription.live) return;
        subscription.live = false;
        const at = subscribers.indexOf(subscription);
        if (at >= 0) subscribers.splice(at, 1);
    };

    return {
        getValue: read,
        subscribe(update) {
            const subscription: TOIMSubscription ={ handler: update, live: true };
            subscribers.push(subscription);
            if (subscribers.length === 1) {
                priming = true;
                try {
                    upstreamUnsub = subscribe(onUpstreamChange);
                } catch (failure) {
                    // A THROWING UPSTREAM MUST NOT LEAVE THIS BINDABLE PERMANENTLY
                    // DEAF: the failed call leaves nothing behind, so the next
                    // subscriber is the first one again.
                    deleteSubscription(subscription);
                    upstreamUnsub = undefined;
                    throw failure;
                } finally {
                    priming = false;
                }
            }
            return () => {
                if (!subscription.live) return;
                deleteSubscription(subscription);
                if (subscribers.length === 0) {
                    upstreamUnsub?.();
                    upstreamUnsub = undefined;
                }
            };
        },
    };
}
