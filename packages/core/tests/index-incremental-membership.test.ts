import {
    createOIMCollectionIndexFactory,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type User = { id: string; name: string };

function setup() {
    const queue = new OIMEventQueue();
    const users = new OIMReactiveCollection<User, string>(queue, {
        selectPk: u => u.id,
    });
    users.upsertMany([
        { id: 'u1', name: 'A' },
        { id: 'u2', name: 'B' },
        { id: 'u3', name: 'C' },
    ]);
    const factory = createOIMCollectionIndexFactory(queue, users);
    return { queue, users, factory };
}

describe('index incremental membership (O(1) addPks/removePks)', () => {
    for (const kind of ['set', 'array'] as const) {
        describe(kind, () => {
            const makeIndex = (factory: ReturnType<typeof setup>['factory']) =>
                kind === 'set'
                    ? factory.setBasedIndex<'g'>()
                    : factory.arrayBasedIndex<'g'>();

            const pksOf = (idx: { getPksByKey(k: 'g'): unknown }) =>
                Array.from(idx.getPksByKey('g') as Iterable<string>).sort();

            test('addPks dedups (adding an existing pk is a no-op)', () => {
                const { queue, factory } = setup();
                const idx = makeIndex(factory);
                idx.setPks('g', ['u1', 'u2']);
                idx.addPks('g', ['u2', 'u3']); // u2 already present
                expect(pksOf(idx)).toEqual(['u1', 'u2', 'u3']);
                idx.destroy();
                queue.destroy();
            });

            test('remove then re-add keeps membership correct', () => {
                const { queue, factory } = setup();
                const idx = makeIndex(factory);
                idx.setPks('g', ['u1', 'u2', 'u3']);

                idx.removePks('g', ['u2']);
                expect(pksOf(idx)).toEqual(['u1', 'u3']);

                // re-adding the removed pk works (membership was updated on remove)
                idx.addPks('g', ['u2']);
                expect(pksOf(idx)).toEqual(['u1', 'u2', 'u3']);

                // adding it again is still a no-op (no duplicate)
                idx.addPks('g', ['u2']);
                expect(pksOf(idx)).toEqual(['u1', 'u2', 'u3']);

                idx.destroy();
                queue.destroy();
            });

            test('entities reflect membership and live updates', () => {
                const { queue, users, factory } = setup();
                const idx = makeIndex(factory);
                idx.setPks('g', ['u1']);
                idx.addPks('g', ['u3']);

                const names = () =>
                    (idx.getEntitiesByKey<User>('g') as (User | undefined)[])
                        .map(u => u?.name)
                        .sort();
                expect(names()).toEqual(['A', 'C']);

                users.upsertOneByPk('u1', { name: 'A2' });
                expect(names()).toEqual(['A2', 'C']);

                idx.destroy();
                queue.destroy();
            });

            test('notifies a key subscriber on add and remove', () => {
                const { queue, factory } = setup();
                const idx = makeIndex(factory);
                idx.setPks('g', ['u1']);

                let calls = 0;
                idx.subscribeOnKey('g', () => calls++);

                idx.addPks('g', ['u2']);
                queue.flush();
                expect(calls).toBe(1);

                idx.removePks('g', ['u1']);
                queue.flush();
                expect(calls).toBe(2);

                idx.destroy();
                queue.destroy();
            });
        });
    }
});
