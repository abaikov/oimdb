import {
    OIMEventQueue,
    OIMReactiveCollection,
    OIMDerivedCollection,
    OIMCollectionStoreTrieDriven,
    TOIMKeyPath,
} from '../src';

type User = { id: string; first: string; last: string; role: string };
type NameView = { id: string; full: string };

describe('OIMDerivedCollection', () => {
    let queue: OIMEventQueue;
    let users: OIMReactiveCollection<User, string>;
    beforeEach(() => {
        queue = new OIMEventQueue();
        users = new OIMReactiveCollection<User, string>(queue, {
            selectPk: u => u.id,
        });
    });
    afterEach(() => queue.destroy());

    const nameView = () =>
        new OIMDerivedCollection<User, NameView, string>(
            queue,
            users,
            u => ({ id: u.id, full: `${u.first} ${u.last}` })
        );

    test('mirrors the source (add / update / remove), consistent synchronously', () => {
        users.upsertOne({ id: 'u1', first: 'Ann', last: 'Lee', role: 'a' });
        const view = nameView();

        // built from current contents
        expect(view.getOneByPk('u1')).toEqual({ id: 'u1', full: 'Ann Lee' });

        // add — no flush needed for derived data (synchronous maintenance)
        users.upsertOne({ id: 'u2', first: 'Bo', last: 'Ng', role: 'b' });
        expect(view.getOneByPk('u2')).toEqual({ id: 'u2', full: 'Bo Ng' });

        // update
        users.upsertOne({ id: 'u1', first: 'Anna', last: 'Lee', role: 'a' });
        expect(view.getOneByPk('u1')).toEqual({ id: 'u1', full: 'Anna Lee' });

        // remove
        users.removeOneByPk('u2');
        expect(view.getOneByPk('u2')).toBeUndefined();
        expect(view.getAllPks().sort()).toEqual(['u1']);

        view.destroy();
    });

    test('memoizes: a source change that leaves the derived value equal does not notify', () => {
        users.upsertOne({ id: 'u1', first: 'Ann', last: 'Lee', role: 'a' });
        const view = new OIMDerivedCollection<User, NameView, string>(
            queue,
            users,
            u => ({ id: u.id, full: `${u.first} ${u.last}` }),
            { compare: (a, b) => a.id === b.id && a.full === b.full }
        );

        let notifications = 0;
        view.subscribeOnKey('u1', () => {
            notifications++;
        });
        queue.flush();
        notifications = 0;

        // change a field the view does NOT derive from → derived value unchanged
        users.upsertOne({ id: 'u1', first: 'Ann', last: 'Lee', role: 'admin' });
        queue.flush();
        expect(notifications).toBe(0); // memoized, no downstream update

        // change a field it DOES derive from
        users.upsertOne({ id: 'u1', first: 'Annie', last: 'Lee', role: 'admin' });
        queue.flush();
        expect(notifications).toBe(1);

        view.destroy();
    });

    test('is re-joinable: a derived collection over a derived collection', () => {
        users.upsertOne({ id: 'u1', first: 'Ann', last: 'Lee', role: 'a' });
        const view = nameView();
        // second derivation over the first — the chain stays consistent
        const shout = new OIMDerivedCollection<NameView, NameView, string>(
            queue,
            view,
            v => ({ id: v.id, full: v.full.toUpperCase() })
        );

        expect(shout.getOneByPk('u1')).toEqual({ id: 'u1', full: 'ANN LEE' });
        users.upsertOne({ id: 'u1', first: 'Bob', last: 'Ng', role: 'a' });
        expect(shout.getOneByPk('u1')).toEqual({ id: 'u1', full: 'BOB NG' });
        users.removeOneByPk('u1');
        expect(shout.getOneByPk('u1')).toBeUndefined();

        shout.destroy();
        view.destroy();
    });

    test('works over a composite-PK source (trie store)', () => {
        type Req = { teamId: string; status: string; n: number };
        const reqs = new OIMReactiveCollection<Req, TOIMKeyPath>(queue, {
            selectPk: r => [r.teamId, r.status],
            store: new OIMCollectionStoreTrieDriven<Req>(),
        });
        reqs.upsertOne({ teamId: 't1', status: 'open', n: 3 });

        const doubled = new OIMDerivedCollection<
            Req,
            { n: number },
            TOIMKeyPath
        >(queue, reqs, r => ({ n: r.n * 2 }), {
            store: new OIMCollectionStoreTrieDriven<{ n: number }>(),
        });

        expect(doubled.getOneByPk(['t1', 'open'])).toEqual({ n: 6 });
        reqs.upsertOneByPk(['t1', 'open'], { n: 5 });
        expect(doubled.getOneByPk(['t1', 'open'])).toEqual({ n: 10 });

        doubled.destroy();
        reqs.destroy();
    });
});
