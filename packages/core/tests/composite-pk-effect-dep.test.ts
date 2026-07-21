import {
    OIMEffect,
    OIMComputeRuntime,
    OIMEffectDependencyKeyedCollection,
    OIMEventQueue,
    OIMEventQueueSchedulerImmediate,
    OIMReactiveCollection,
    OIMCollectionStoreTrieDriven,
    TOIMKeyPath,
} from '../src';

type Req = { teamId: string; status: string; v: number };

describe('effect/computed dependency over a composite-PK collection (regression)', () => {
    let queue: OIMEventQueue;
    let runtime: OIMComputeRuntime;
    beforeEach(() => {
        queue = new OIMEventQueue({
            scheduler: new OIMEventQueueSchedulerImmediate(),
        });
        runtime = new OIMComputeRuntime(queue);
    });
    afterEach(() => queue.destroy());

    test('OIMEffect on a composite PK recomputes when that PK changes', () => {
        const reqs = new OIMReactiveCollection<Req, TOIMKeyPath>(queue, {
            selectPk: r => [r.teamId, r.status],
            store: new OIMCollectionStoreTrieDriven<Req>(),
        });
        let runs = 0;
        const effect = new OIMEffect(runtime, {
            // Single composite key [teamId, status] — must NOT be read as two keys.
            deps: [
                new OIMEffectDependencyKeyedCollection(reqs, ['t1', 'open']),
            ],
            run: () => {
                runs++;
            },
        });

        reqs.upsertOne({ teamId: 't1', status: 'open', v: 1 });
        queue.flush();
        reqs.upsertOneByPk(['t1', 'open'], { v: 2 });
        queue.flush();

        // Before the fix this stayed 0 (subscribed to 't1' and 'open' as two
        // primitive keys, neither of which exists).
        expect(runs).toBeGreaterThan(0);

        // A change to an unrelated composite PK must NOT fire it.
        const before = runs;
        reqs.upsertOne({ teamId: 't2', status: 'closed', v: 1 });
        queue.flush();
        expect(runs).toBe(before);

        effect.destroy();
        reqs.destroy();
    });

    test('several composite keys = several dependencies', () => {
        const reqs = new OIMReactiveCollection<Req, TOIMKeyPath>(queue, {
            selectPk: r => [r.teamId, r.status],
            store: new OIMCollectionStoreTrieDriven<Req>(),
        });
        let runs = 0;
        const effect = new OIMEffect(runtime, {
            // One dependency per composite key — the deps array is how you
            // depend on more than one key.
            deps: [
                new OIMEffectDependencyKeyedCollection(reqs, ['t1', 'open']),
                new OIMEffectDependencyKeyedCollection(reqs, ['t2', 'open']),
            ],
            run: () => {
                runs++;
            },
        });

        reqs.upsertOne({ teamId: 't2', status: 'open', v: 1 });
        queue.flush();
        expect(runs).toBeGreaterThan(0);

        effect.destroy();
        reqs.destroy();
    });

    test('primitive-PK control still works', () => {
        const users = new OIMReactiveCollection<{ id: string; v: number }, string>(
            queue,
            { selectPk: u => u.id }
        );
        let runs = 0;
        const effect = new OIMEffect(runtime, {
            deps: [new OIMEffectDependencyKeyedCollection(users, 'u1')],
            run: () => {
                runs++;
            },
        });
        users.upsertOne({ id: 'u1', v: 1 });
        queue.flush();
        expect(runs).toBeGreaterThan(0);
        effect.destroy();
        users.destroy();
    });
});
