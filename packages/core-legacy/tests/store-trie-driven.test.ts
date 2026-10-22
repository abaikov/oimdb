import { OIMCollectionStoreTrieDriven } from '../src/core/OIMCollectionStoreTrieDriven';
import type { TOIMKeyPath } from '../src/types/TOIMKeyPath';

type Membership = { userId: number; projectId: string; role: string };

/**
 * The composite-PK store. Everything about a key path being matched by CONTENT — a freshly built
 * `[1, 'p']` resolving to the entity stored under an earlier `[1, 'p']` — lives here, and so does
 * the interning that keeps one canonical `slot.pk` per logical key.
 */
describe('OIMCollectionStoreTrieDriven', () => {
    const pkOf = (m: Membership): TOIMKeyPath => [m.userId, m.projectId];

    const make = () => new OIMCollectionStoreTrieDriven<Membership>();

    const a: Membership = { userId: 1, projectId: 'p1', role: 'admin' };
    const b: Membership = { userId: 1, projectId: 'p2', role: 'dev' };
    const c: Membership = { userId: 2, projectId: 'p1', role: 'dev' };

    test('a freshly built path resolves to the entity stored under an equal one', () => {
        const store = make();
        store.setOneByPk(pkOf(a), a);

        expect(store.getOneByPk([1, 'p1'])?.role).toBe('admin');
        expect(store.getOneByPk([1, 'p1'])).toBe(store.getOneByPk([1, 'p1']));
    });

    test('segments keep their type: 1 and "1" are different keys', () => {
        const store = make();
        store.setOneByPk([1, 'p'], a);
        store.setOneByPk(['1', 'p'], b);

        expect(store.getOneByPk([1, 'p'])?.role).toBe('admin');
        expect(store.getOneByPk(['1', 'p'])?.role).toBe('dev');
    });

    test('no separator can collide: ["a","b"] is not ["a|b"] nor ["ab"]', () => {
        const store = make();
        store.setOneByPk(['a', 'b'], a);

        expect(store.getOneByPk(['a|b'])).toBeUndefined();
        expect(store.getOneByPk(['ab'])).toBeUndefined();
        expect(store.getOneByPk(['a', 'b'])).toBeDefined();
    });

    test('arity is part of the key: a prefix is a different bucket', () => {
        const store = make();
        store.setOneByPk([1, 'p1'], a);

        expect(store.getOneByPk([1])).toBeUndefined();
        expect(store.getOneByPk([1, 'p1', 'extra'])).toBeUndefined();
    });

    test('the slot is a stable carrier across updates', () => {
        const store = make();
        store.setOneByPk(pkOf(a), a);
        const first = store.getSlotByPk([1, 'p1']);

        store.setOneByPk([1, 'p1'], { ...a, role: 'owner' });
        const second = store.getSlotByPk([1, 'p1']);

        expect(second).toBe(first); // same carrier…
        expect(store.getOneByPk([1, 'p1'])?.role).toBe('owner'); // …new content
    });

    test('setManyByPks and getSlotsByPks work over content-matched paths', () => {
        const store = make();
        store.setManyByPks(
            [pkOf(a), pkOf(b), pkOf(c)],
            [a, b, c]
        );

        expect(store.countAll()).toBe(3);
        const slots = store.getSlotsByPks([
            [1, 'p1'],
            [2, 'p1'],
        ]);
        expect(slots).toHaveLength(2);
    });

    test('reads are length-aligned; compaction is the separate call', () => {
        const store = make();
        store.setOneByPk(pkOf(a), a);

        const aligned = store.getManyByPks([[1, 'p1'], [9, 'nope']]);
        expect(aligned).toHaveLength(2);
        expect(aligned[0]?.role).toBe('admin');
        expect(aligned[1]).toBeUndefined();

        const compact = store.getManyByPksCompact([[1, 'p1'], [9, 'nope']]);
        expect(compact).toHaveLength(1);
    });

    test('findSlotByPk reports absence without reserving anything', () => {
        const store = make();
        expect(store.findSlotByPk([1, 'p1'])).toBeUndefined();
        expect(store.countAll()).toBe(0);
    });

    test('getOrReserveSlotByPk reserves once and returns the same carrier after', () => {
        const store = make();
        const reserved = store.getOrReserveSlotByPk([1, 'p1']);
        const again = store.getOrReserveSlotByPk([1, 'p1']);

        expect(again).toBe(reserved);
    });

    test('removal frees exactly one path and leaves its neighbours alone', () => {
        const store = make();
        store.setManyByPks([pkOf(a), pkOf(b), pkOf(c)], [a, b, c]);

        store.removeOneByPk([1, 'p1']);
        expect(store.getOneByPk([1, 'p1'])).toBeUndefined();
        expect(store.getOneByPk([1, 'p2'])?.role).toBe('dev'); // shares the first segment
        expect(store.getOneByPk([2, 'p1'])?.role).toBe('dev'); // shares the second
        expect(store.countAll()).toBe(2);

        // Removing something absent is harmless.
        store.removeOneByPk([9, 'nope']);
        expect(store.countAll()).toBe(2);
    });

    test('removeManyByPks removes each of them', () => {
        const store = make();
        store.setManyByPks([pkOf(a), pkOf(b), pkOf(c)], [a, b, c]);

        store.removeManyByPks([[1, 'p1'], [2, 'p1']]);
        expect(store.countAll()).toBe(1);
        expect(store.getOneByPk([1, 'p2'])).toBeDefined();
    });

    test('getAll / getAllPks / getAllSlots agree with each other', () => {
        const store = make();
        store.setManyByPks([pkOf(a), pkOf(b)], [a, b]);

        expect(store.getAll()).toHaveLength(2);
        expect(store.getAllSlots()).toHaveLength(2);

        const pks = store.getAllPks();
        expect(pks).toHaveLength(2);
        // Every reported pk must resolve back to an entity.
        for (const pk of pks) expect(store.getOneByPk(pk)).toBeDefined();
    });

    test('clear empties it, and it stays usable afterwards', () => {
        const store = make();
        store.setManyByPks([pkOf(a), pkOf(b)], [a, b]);

        store.clear();
        expect(store.countAll()).toBe(0);
        expect(store.getAll()).toEqual([]);
        expect(store.getOneByPk([1, 'p1'])).toBeUndefined();

        store.setOneByPk(pkOf(c), c);
        expect(store.getOneByPk([2, 'p1'])?.role).toBe('dev');
    });

    test('a deeper key path works the same way', () => {
        const store = make();
        store.setOneByPk([1, 'p1', 'admin'], a);

        expect(store.getOneByPk([1, 'p1', 'admin'])).toBeDefined();
        expect(store.getOneByPk([1, 'p1', 'dev'])).toBeUndefined();
        expect(store.getOneByPk([1, 'p1'])).toBeUndefined();
    });
});
