import { OIMEventQueue, createOIMCollectionKit } from '@oimdb/core';
import { exoCollection, exoDb } from '../src';

type User = { id: string; name: string; teamId: string; online: boolean };

const testBindable = <T>(initial: T) => {
    let value = initial;
    const subscribers = new Set<() => void>();
    return {
        getValue: () => value,
        subscribe(update: () => void) {
            subscribers.add(update);
            return () => subscribers.delete(update);
        },
        setValue(next: T) {
            if (Object.is(next, value)) return;
            value = next;
            for (const s of Array.from(subscribers)) if (subscribers.has(s)) s();
        },
    };
};

const setup = () => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<User, string>(queue, {
        selectPk: u => u.id,
    });
    const byTeam = kit.indexFactory.derivedSetIndex<string>(u => u.teamId);
    const byTeamOrdered = kit.indexFactory.derivedArrayIndex<string>(
        u => u.teamId,
        { orderBy: u => u.name }
    );
    const byPath = kit.indexFactory.compositeSetIndex();
    const byPathOrdered = kit.indexFactory.compositeArrayIndex();
    const online = kit.indexFactory.derivedSetGlobalIndex({
        filter: u => u.online,
    });
    const allOrdered = kit.indexFactory.derivedArrayGlobalIndex({
        orderBy: u => u.name,
    });

    kit.collection.upsertMany([
        { id: 'u1', name: 'Alice', teamId: 't1', online: true },
        { id: 'u2', name: 'Bob', teamId: 't1', online: false },
        { id: 'u3', name: 'Cara', teamId: 't2', online: true },
    ]);
    byPath.setPks(['t1', 'x'], ['u1']);
    byPathOrdered.setPks(['t1', 'x'], ['u2', 'u1']);
    queue.flush();

    const users = exoCollection(kit, {
        byTeam,
        byTeamOrdered,
        byPath,
        byPathOrdered,
        online,
        allOrdered,
    });
    return { queue, kit, users };
};

const names = (b: { getValue(): readonly (User | undefined)[] }) =>
    b.getValue().map(u => u?.name);

describe('exoCollection', () => {
    test('byPk / byPks, with a plain and a bindable key', () => {
        const { users } = setup();

        expect(users.byPk('u1').getValue()?.name).toBe('Alice');
        expect(names(users.byPks(['u1', 'u3']))).toEqual(['Alice', 'Cara']);

        const pk = testBindable<string>('u1');
        const moving = users.byPk(pk);
        expect(moving.getValue()?.name).toBe('Alice');
        let hits = 0;
        moving.subscribe(() => hits++);
        pk.setValue('u2');
        expect(hits).toBe(1);
        expect(moving.getValue()?.name).toBe('Bob');
    });

    test('every index kind is dispatched from the index itself', () => {
        const { users } = setup();

        expect(names(users.byTeam('t1')).sort()).toEqual(['Alice', 'Bob']);
        expect(names(users.byTeamOrdered('t1'))).toEqual(['Alice', 'Bob']);
        expect(names(users.byPath(['t1', 'x']))).toEqual(['Alice']);
        expect(names(users.byPathOrdered(['t1', 'x']))).toEqual(['Bob', 'Alice']);
        expect(names(users.online()).sort()).toEqual(['Alice', 'Cara']);
        expect(names(users.allOrdered())).toEqual(['Alice', 'Bob', 'Cara']);
    });

    test('pks, and a bindable key that repoints', () => {
        const { users } = setup();

        expect([...users.byTeam.pks('t1').getValue()].sort()).toEqual(['u1', 'u2']);
        expect([...users.online.pks().getValue()].sort()).toEqual(['u1', 'u3']);

        const team = testBindable<string>('t1');
        const rows = users.byTeam(team);
        let hits = 0;
        rows.subscribe(() => hits++);
        team.setValue('t2');
        expect(hits).toBe(1);
        expect(names(rows)).toEqual(['Cara']);
    });

    test('rows: identity-stable children, each row bound to its own entity', () => {
        const { queue, kit, users } = setup();

        let renders = 0;
        const rows = users.byTeamOrdered.rows('t1', (entity, pk) => {
            renders++;
            return { pk, entity };
        });

        const first = rows.getValue();
        expect(first.map(r => r.pk)).toEqual(['u1', 'u2']);
        expect(renders).toBe(2);
        expect(first[0].entity.getValue()?.name).toBe('Alice');

        // A field edit does not change membership → same array, no re-render...
        kit.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();
        expect(rows.getValue()).toBe(first);
        expect(renders).toBe(2);
        // ...while the row's own bindable sees the new value.
        expect(first[0].entity.getValue()?.name).toBe('Ally');
    });

    test('list: O(delta) ops, only on ordered indexes', () => {
        const { queue, kit, users } = setup();

        const list = users.byTeamOrdered.list('t1', (_entity, pk) => ({ pk }));
        expect(list.snapshot().map(r => r.pk)).toEqual(['u1', 'u2']);

        const ops: { type: string }[] = [];
        const stop = list.subscribeOps(op => ops.push(op));

        kit.collection.upsertOne({
            id: 'u4',
            name: 'Aaron',
            teamId: 't1',
            online: false,
        });
        queue.flush();
        expect(ops.some(op => op.type === 'insert')).toBe(true);
        expect(list.snapshot().map(r => r.pk)).toEqual(['u4', 'u1', 'u2']);

        stop();

        // A set-based index carries no order, so it offers no `list` — statically or at runtime.
        expect('list' in users.byTeam).toBe(false);
        expect('list' in users.byTeamOrdered).toBe(true);
    });

    test('subscribe: manual, onExoMount-scoped, no bindable involved', () => {
        const { queue, kit, users } = setup();

        let hits = 0;
        const stop = users.byTeam.subscribe('t1', () => hits++);
        expect(hits).toBe(0); // no spurious emit at subscribe time

        kit.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();
        expect(hits).toBe(1);

        stop();
        kit.collection.upsertOneByPk('u1', { name: 'Alicia' });
        queue.flush();
        expect(hits).toBe(1); // torn down
    });

    test('kit stays reachable for writes', () => {
        const { queue, users } = setup();
        users.kit.collection.upsertOne({
            id: 'u9',
            name: 'Zed',
            teamId: 't9',
            online: false,
        });
        queue.flush();
        expect(users.byPk('u9').getValue()?.name).toBe('Zed');
    });

    test('a non-index argument fails loudly', () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        expect(() => exoCollection(kit, { nope: {} })).toThrow(
            /not a reactive index/
        );
    });
});

describe('exoDb', () => {
    test('maps a whole spec, with and without indexes', () => {
        const queue = new OIMEventQueue();
        const usersKit = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeam = usersKit.indexFactory.derivedSetIndex<string>(
            u => u.teamId
        );
        type Tag = { slug: string; label: string };
        const tagsKit = createOIMCollectionKit<Tag, string>(queue, {
            selectPk: t => t.slug,
        });

        usersKit.collection.upsertOne({
            id: 'u1',
            name: 'Alice',
            teamId: 't1',
            online: true,
        });
        tagsKit.collection.upsertOne({ slug: 'red', label: 'Red' });
        queue.flush();

        const db = exoDb({
            users: { kit: usersKit, indexes: { byTeam } },
            tags: { kit: tagsKit },
        });

        expect(db.users.byPk('u1').getValue()?.name).toBe('Alice');
        expect(names(db.users.byTeam('t1'))).toEqual(['Alice']);
        expect(db.tags.byPk('red').getValue()?.label).toBe('Red');
    });

    test('a spec hoisted into a variable infers exactly like an inline one', () => {
        const queue = new OIMEventQueue();
        const usersKit = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        const byTeam = usersKit.indexFactory.derivedSetIndex<string>(
            u => u.teamId
        );
        usersKit.collection.upsertOne({
            id: 'u1',
            name: 'Alice',
            teamId: 't1',
            online: true,
        });
        queue.flush();

        // Object entries, not [kit, indexes] tuples: a tuple only infers as one at the call site,
        // so this exact shape used to collapse every view to `never`.
        const spec = { users: { kit: usersKit, indexes: { byTeam } } };
        const db = exoDb(spec);

        const name: string | undefined = db.users.byPk('u1').getValue()?.name;
        expect(name).toBe('Alice');
        expect(names(db.users.byTeam('t1'))).toEqual(['Alice']);
    });
});

describe('read cost', () => {
    test('a subscribed read is O(1): same references back, nothing recomputed', () => {
        const { queue, kit, users } = setup();
        void queue;
        void kit;

        const pks = users.byTeam.pks('t1');
        pks.subscribe(() => undefined);
        const firstPks = pks.getValue();
        expect(pks.getValue()).toBe(firstPks); // membership cached behind the index's own signal

        let renders = 0;
        const rows = users.byTeamOrdered.rows('t1', (_e, pk) => {
            renders++;
            return { pk };
        });
        rows.subscribe(() => undefined);
        const firstRows = rows.getValue();
        expect(rows.getValue()).toBe(firstRows);
        expect(rows.getValue()).toBe(firstRows);
        expect(renders).toBe(2); // one per row, never again
    });

    test('an UNSUBSCRIBED read stays correct (nothing invalidates a cache there)', () => {
        const { queue, kit, users } = setup();

        const pks = users.byTeam.pks('t1');
        expect([...pks.getValue()].sort()).toEqual(['u1', 'u2']);

        kit.collection.upsertOne({
            id: 'u5',
            name: 'Eve',
            teamId: 't1',
            online: false,
        });
        queue.flush();

        expect([...pks.getValue()].sort()).toEqual(['u1', 'u2', 'u5']);
    });
});
