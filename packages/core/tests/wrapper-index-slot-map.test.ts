import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveCollection } from '../src/core/OIMReactiveCollection';
import { createOIMCollectionIndexFactory } from '../src/core/OIMCollectionIndexFactory';
import { createOIMIndexSlotMap } from '../src/modules/wrapper/index/createOIMIndexSlotMap';
import { TOIMAnyEntitySlot } from '../src/types/TOIMEntitySlot';

type User = { id: string; teamId: string; name: string };

function setup() {
    const queue = new OIMEventQueue();
    const users = new OIMReactiveCollection<User, string>(queue, {
        selectPk: u => u.id,
    });
    users.upsertMany([
        { id: 'u1', teamId: 't1', name: 'Alice' },
        { id: 'u2', teamId: 't1', name: 'Bob' },
        { id: 'u3', teamId: 't2', name: 'Carol' },
    ]);
    const indexFactory = createOIMCollectionIndexFactory(queue, users);
    return { queue, users, indexFactory };
}

/** A mapped "row" with a unique instance id so identity is observable. */
type Row = { instance: number; pk: string };

describe('OIMIndexSlotMap', () => {
    test('same slot maps to the same object reference across reads (set-based)', () => {
        const { indexFactory } = setup();
        const byTeam = indexFactory.derivedSetIndex<string>(u => u.teamId);

        let next = 0;
        const rows = createOIMIndexSlotMap(
            byTeam,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: next++,
                pk: slot.pk,
            })
        );

        const first = rows.getByKey('t1');
        const second = rows.getByKey('t1');

        expect(first).toHaveLength(2);
        // reference-equal element-by-element (order matched within the same set)
        const byPk = (arr: Row[]) =>
            new Map(arr.map(r => [r.pk, r] as const));
        const a = byPk(first);
        const b = byPk(second);
        expect(b.get('u1')).toBe(a.get('u1'));
        expect(b.get('u2')).toBe(a.get('u2'));
        // create ran once per slot, not once per read
        expect(next).toBe(2);
    });

    test('works over an array-based derived index, preserving order', () => {
        const { indexFactory } = setup();
        const byTeamOrdered = indexFactory.derivedArrayIndex<string>(
            u => u.teamId,
            { orderBy: u => u.name }
        );

        const rows = createOIMIndexSlotMap(
            byTeamOrdered,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: 0,
                pk: slot.pk,
            })
        );

        expect(rows.getByKey('t1').map(r => r.pk)).toEqual(['u1', 'u2']); // Alice, Bob
    });

    test('a new member gets a fresh object; existing members keep theirs', () => {
        const { queue, users, indexFactory } = setup();
        const byTeam = indexFactory.derivedSetIndex<string>(u => u.teamId);

        let next = 0;
        const rows = createOIMIndexSlotMap(
            byTeam,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: next++,
                pk: slot.pk,
            })
        );

        const before = new Map(
            rows.getByKey('t1').map(r => [r.pk, r] as const)
        );
        const u1Row = before.get('u1');

        // add a new user to t1
        users.upsertOne({ id: 'u4', teamId: 't1', name: 'Dave' });
        queue.flush();

        const after = new Map(
            rows.getByKey('t1').map(r => [r.pk, r] as const)
        );
        expect(after.get('u1')).toBe(u1Row); // stable
        expect(after.has('u4')).toBe(true); // new one appeared
        expect(after.get('u4')).not.toBe(u1Row);
    });

    test('subscribeOnKey is a passthrough to the index', () => {
        const { queue, users, indexFactory } = setup();
        const byTeam = indexFactory.derivedSetIndex<string>(u => u.teamId);
        const rows = createOIMIndexSlotMap(byTeam, () => ({}));

        let fired = 0;
        const off = rows.subscribeOnKey('t1', () => {
            fired++;
        });

        users.upsertOne({ id: 'u5', teamId: 't1', name: 'Eve' });
        queue.flush();

        expect(fired).toBeGreaterThan(0);
        off();
    });

    test('map() chains projections with stable identity at each level', () => {
        const { indexFactory } = setup();
        const byTeam = indexFactory.derivedSetIndex<string>(u => u.teamId);

        let rowN = 0;
        let cellN = 0;
        const rows = createOIMIndexSlotMap(
            byTeam,
            (slot: TOIMAnyEntitySlot<string>): Row => ({
                instance: rowN++,
                pk: slot.pk,
            })
        );
        const cells = rows.map((row: Row) => ({ cell: cellN++, of: row }));

        const a = new Map(
            cells.getByKey('t1').map(c => [c.of.pk, c] as const)
        );
        const b = new Map(
            cells.getByKey('t1').map(c => [c.of.pk, c] as const)
        );

        // Chained objects are stable across reads...
        expect(b.get('u1')).toBe(a.get('u1'));
        // ...and reuse the SAME underlying Row the first map produced.
        const u1Row = rows.getByKey('t1').find(r => r.pk === 'u1');
        expect(a.get('u1')?.of).toBe(u1Row);
        // Each create ran once per slot, not once per read.
        expect(rowN).toBe(2);
        expect(cellN).toBe(2);
    });

    test('get() memoizes even when create returns undefined', () => {
        const { indexFactory } = setup();
        const byTeam = indexFactory.derivedSetIndex<string>(u => u.teamId);

        let calls = 0;
        const rows = createOIMIndexSlotMap(byTeam, () => {
            calls++;
            return undefined;
        });

        const slot = [...byTeam.getSlotsByKey('t1')][0];
        rows.get(slot);
        rows.get(slot);
        expect(calls).toBe(1); // cached despite undefined value
    });
});
