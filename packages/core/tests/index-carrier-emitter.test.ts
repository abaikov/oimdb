import {
    OIMEventQueue,
    OIMReactiveIndexManualSetBased,
    TOIMAnyEntitySlot,
} from '../src';

const slot = (pk: string): TOIMAnyEntitySlot<string> => ({
    pk,
    item: { id: pk },
});

/**
 * The reactive index is backed by the carrier-based keyed emitter (handlers on
 * a per-key carrier, pruned when the last subscriber leaves). These cases lock
 * the per-key delivery, in-batch dedup, and the prune → re-subscribe path that
 * the carrier migration introduced.
 */
describe('index carrier emitter', () => {
    test('delivers only to the updated key, once per batch', () => {
        const queue = new OIMEventQueue();
        const index = new OIMReactiveIndexManualSetBased<string, string>(queue);
        const calls: string[] = [];

        index.subscribeOnKey('team1', () => calls.push('team1'));
        index.subscribeOnKey('team2', () => calls.push('team2'));

        // Two writes to team1 in one batch must coalesce to a single delivery.
        index.setSlots('team1', new Set([slot('u1')]));
        index.addSlots('team1', [slot('u2')]);
        queue.flush();

        expect(calls).toEqual(['team1']);
    });

    test('stops delivering after unsubscribe', () => {
        const queue = new OIMEventQueue();
        const index = new OIMReactiveIndexManualSetBased<string, string>(queue);
        const calls: string[] = [];

        const unsubscribe = index.subscribeOnKey('team1', () =>
            calls.push('hit')
        );
        index.setSlots('team1', new Set([slot('u1')]));
        queue.flush();
        expect(calls).toEqual(['hit']);

        unsubscribe();
        index.setSlots('team1', new Set([slot('u2')]));
        queue.flush();
        expect(calls).toEqual(['hit']); // no further delivery
    });

    test('re-subscribe after the carrier was pruned still delivers', () => {
        const queue = new OIMEventQueue();
        const index = new OIMReactiveIndexManualSetBased<string, string>(queue);
        const calls: string[] = [];

        // Subscribe then fully unsubscribe — the key's carrier is pruned.
        const unsubscribe = index.subscribeOnKey('team1', () =>
            calls.push('first')
        );
        unsubscribe();
        expect(index.hasSubscriptions()).toBe(false);

        // A fresh subscription on the same key must get a working carrier.
        index.subscribeOnKey('team1', () => calls.push('second'));
        index.setSlots('team1', new Set([slot('u1')]));
        queue.flush();

        expect(calls).toEqual(['second']);
    });
});
