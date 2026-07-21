import { bindable } from '@exodra/reactivity';
import type { TExoListOp } from '@exodra/reactivity';
import {
    OIMComputed,
    OIMComputeRuntime,
    OIMEffectDependencyKeyedObject,
    OIMEventQueue,
    OIMReactiveObject,
    createOIMCollectionKit,
    createOIMOrderedListCommandStreamDiffDriven,
} from '@oimdb/core';
import {
    bindSelectors,
    combine,
    entityRows,
    fromComputed,
    fromOimdb,
    fromSelector,
    keyedChildren,
    listFromCommandStream,
    readEntitiesByIndexKey,
    subscribeEntitiesByIndexKey,
} from '../src';

type User = { id: string; name: string; teamId: string };

const makeUsers = () => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<User, string>(queue, {
        selectPk: user => user.id,
    });
    const byTeam = kit.indexFactory.derivedSetIndex<string>(
        user => user.teamId
    );
    return { queue, kit, byTeam };
};

describe('fromOimdb (core adapter)', () => {
    test('is lazy and ref-counted: subscribes upstream only while it has subscribers', () => {
        let value = 1;
        let subscribeCount = 0;
        let activeUnsubs = 0;
        let notify: (() => void) | undefined;

        const source = fromOimdb<number>(
            () => value,
            onChange => {
                subscribeCount++;
                activeUnsubs++;
                notify = onChange;
                return () => {
                    activeUnsubs--;
                    notify = undefined;
                };
            }
        );

        expect(subscribeCount).toBe(0); // getValue alone never subscribes
        expect(source.getValue()).toBe(1);

        const a = source.subscribe(() => undefined);
        const b = source.subscribe(() => undefined);
        expect(subscribeCount).toBe(1); // second subscriber does NOT re-subscribe upstream
        expect(activeUnsubs).toBe(1);

        value = 2;
        expect(source.getValue()).toBe(2); // getValue always reads fresh

        a();
        expect(activeUnsubs).toBe(1); // still one subscriber → upstream stays
        b();
        expect(activeUnsubs).toBe(0); // last subscriber gone → upstream torn down
        expect(notify).toBeUndefined();
    });

    test('equals suppresses no-op emits; alwaysNotify forwards every change', () => {
        let value = 1;
        let notify: () => void = () => undefined;
        const subscribe = (onChange: () => void) => {
            notify = onChange;
            return () => undefined;
        };

        const deduped = fromOimdb(() => value, subscribe);
        const seenDeduped: number[] = [];
        deduped.subscribe(() => seenDeduped.push(value));
        notify(); // same value → suppressed
        value = 2;
        notify();
        expect(seenDeduped).toEqual([2]);

        value = 5;
        const always = fromOimdb(() => value, subscribe, { alwaysNotify: true });
        let count = 0;
        always.subscribe(() => count++);
        notify();
        notify();
        expect(count).toBe(2); // identical value, still forwarded
    });
});

describe('combine', () => {
    test('recomputes from multiple sources and is lazy', () => {
        let subs = 0;
        const mk = (getV: () => number) =>
            fromOimdb(getV, () => {
                subs++;
                return () => subs--;
            });

        let x = 1;
        let y = 2;
        const sum = combine([mk(() => x), mk(() => y)], () => x + y);
        expect(subs).toBe(0);
        expect(sum.getValue()).toBe(3);

        let hits = 0;
        const stop = sum.subscribe(() => hits++);
        expect(subs).toBe(2); // both sources now subscribed
        x = 10;
        expect(sum.getValue()).toBe(12);
        stop();
        expect(subs).toBe(0);
        expect(hits).toBe(0); // sources here never call their onChange; wiring is what we assert
    });
});

describe('bindSelectors / fromSelector', () => {
    test('byPk reads and reacts across a flush', () => {
        const { queue, kit } = makeUsers();
        kit.collection.upsertOne({ id: 'u1', name: 'Alice', teamId: 't1' });
        queue.flush();

        const bound = bindSelectors(kit.select);
        const alice = bound.byPk('u1');
        expect(alice.getValue()).toEqual({ id: 'u1', name: 'Alice', teamId: 't1' });

        let hits = 0;
        alice.subscribe(() => hits++);
        expect(hits).toBe(0); // immediate watch primes without a spurious emit

        kit.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();
        expect(hits).toBe(1);
        expect(alice.getValue()).toEqual({ id: 'u1', name: 'Ally', teamId: 't1' });

        kit.destroy();
        queue.destroy();
    });

    test('fromSelector on entitiesBySetIndexKey tracks membership + entity edits', () => {
        const { queue, kit, byTeam } = makeUsers();
        kit.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 't1' },
            { id: 'u2', name: 'Bob', teamId: 't2' },
        ]);
        queue.flush();

        const t1 = fromSelector(kit.select.entitiesBySetIndexKey(byTeam, 't1'));
        expect(t1.getValue()).toEqual([{ id: 'u1', name: 'Alice', teamId: 't1' }]);

        let hits = 0;
        t1.subscribe(() => hits++);
        kit.collection.upsertOne({ id: 'u3', name: 'Cara', teamId: 't1' });
        queue.flush();
        expect(hits).toBe(1);
        expect(t1.getValue()).toHaveLength(2);

        kit.destroy();
        queue.destroy();
    });

    test('reactive key: a bindable key re-points the selector', () => {
        const { queue, kit, byTeam } = makeUsers();
        kit.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 't1' },
            { id: 'u2', name: 'Bob', teamId: 't2' },
        ]);
        queue.flush();

        const bound = bindSelectors(kit.select);
        const key = bindable('t1');
        const rows = bound.entitiesBySetIndexKey(byTeam, key);
        expect(rows.getValue()).toEqual([
            { id: 'u1', name: 'Alice', teamId: 't1' },
        ]);

        let hits = 0;
        rows.subscribe(() => hits++);
        key.setValue('t2');
        expect(hits).toBe(1); // re-pointed synchronously
        expect(rows.getValue()).toEqual([{ id: 'u2', name: 'Bob', teamId: 't2' }]);

        kit.destroy();
        queue.destroy();
    });
});

describe('low-level fine-grained subscription', () => {
    test('subscribeEntitiesByIndexKey fires on membership and on per-entity edits', () => {
        const { queue, kit, byTeam } = makeUsers();
        kit.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 't1' },
            { id: 'u2', name: 'Bob', teamId: 't2' },
        ]);
        queue.flush();

        expect(readEntitiesByIndexKey(kit.collection, byTeam, 't1')).toEqual([
            { id: 'u1', name: 'Alice', teamId: 't1' },
        ]);

        let hits = 0;
        const stop = subscribeEntitiesByIndexKey(
            kit.collection,
            byTeam,
            't1',
            () => hits++
        );

        // per-entity edit of a current member
        kit.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();
        expect(hits).toBeGreaterThanOrEqual(1);

        // membership change: a new entity joins t1
        const before = hits;
        kit.collection.upsertOne({ id: 'u3', name: 'Cara', teamId: 't1' });
        queue.flush();
        expect(hits).toBeGreaterThan(before);

        stop();
        kit.destroy();
        queue.destroy();
    });
});

describe('keyedChildren / entityRows identity', () => {
    test('cached schema per key: field edit is a reconcile no-op, membership rebuilds', () => {
        const { queue, kit, byTeam } = makeUsers();
        kit.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 't1' },
            { id: 'u2', name: 'Bea', teamId: 't1' },
        ]);
        queue.flush();

        const bound = bindSelectors(kit.select);
        const order = fromSelector(
            kit.select.entitiesBySetIndexKey(byTeam, 't1')
        );

        let renderCount = 0;
        const rows = keyedChildren<User | undefined, { id: string }>(order, {
            key: user => user?.id ?? '∅',
            render: user => {
                renderCount++;
                return { id: user?.id ?? '∅' };
            },
        });

        let emits = 0;
        rows.subscribe(() => emits++);
        const first = rows.getValue();
        expect(first).toHaveLength(2);
        expect(renderCount).toBe(2);

        // field edit — keys unchanged → schema array element-equal → no emit, no re-render
        kit.collection.upsertOneByPk('u1', { name: 'Alicia' });
        queue.flush();
        const second = rows.getValue();
        expect(second[0]).toBe(first[0]); // same cached schema identity
        expect(renderCount).toBe(2);
        expect(emits).toBe(0);

        // membership change → new row rendered, list emits
        kit.collection.upsertOne({ id: 'u3', name: 'Cy', teamId: 't1' });
        queue.flush();
        expect(rows.getValue()).toHaveLength(3);
        expect(renderCount).toBe(3);
        expect(emits).toBe(1);

        void entityRows; // exported sugar exercised below
        void bound;
        kit.destroy();
        queue.destroy();
    });

    test('entityRows keys by pk and binds each row to its own entity bindable', () => {
        const { queue, kit } = makeUsers();
        kit.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 't1' },
            { id: 'u2', name: 'Bob', teamId: 't1' },
        ]);
        queue.flush();

        const bound = bindSelectors(kit.select);
        const order = fromOimdb<readonly string[]>(
            () => ['u1', 'u2'],
            () => () => undefined
        );

        const rows = entityRows<User, string, { pk: string; entity: unknown }>(
            order,
            pk => bound.byPk(pk),
            (entity, pk) => ({ pk, entity })
        );

        const rendered = rows.getValue();
        expect(rendered.map(r => r.pk)).toEqual(['u1', 'u2']);
        // stable identity across reads (cached per pk)
        expect(rows.getValue()[0]).toBe(rendered[0]);

        kit.destroy();
        queue.destroy();
    });
});

describe('listFromCommandStream (O(delta) path)', () => {
    type Card = { id: string; deckId: string; position: number };

    test('snapshot reads current order; ops forward insert/move from the stream', () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<Card, string>(queue, {
            selectPk: card => card.id,
        });
        const byDeck = kit.indexFactory.derivedArrayIndex<string>(
            card => card.deckId,
            { orderBy: card => card.position }
        );
        const stream = createOIMOrderedListCommandStreamDiffDriven<
            string,
            string,
            Card
        >(queue, byDeck);

        kit.collection.upsertMany([
            { id: 'c1', deckId: 'd1', position: 0 },
            { id: 'c2', deckId: 'd1', position: 1 },
        ]);
        queue.flush();

        const list = listFromCommandStream(
            stream,
            'd1',
            slot => slot.pk // render → the row's stable key
        );
        expect(list.snapshot()).toEqual(['c1', 'c2']);

        const ops: TExoListOp<string>[] = [];
        const stop = list.subscribeOps(op => ops.push(op));

        // a new card joins the deck → an insert command
        kit.collection.upsertOne({ id: 'c3', deckId: 'd1', position: 2 });
        queue.flush();
        expect(ops.some(op => op.type === 'insert')).toBe(true);
        expect(list.snapshot()).toEqual(['c1', 'c2', 'c3']);

        // reorder → a move command (not remove+insert), so the DOM node is relocated
        ops.length = 0;
        kit.collection.upsertOneByPk('c3', { position: -1 });
        queue.flush();
        expect(ops.some(op => op.type === 'move')).toBe(true);
        expect(list.snapshot()).toEqual(['c3', 'c1', 'c2']);

        stop();
        kit.destroy();
        queue.destroy();
    });
});

describe('fromComputed', () => {
    test('wraps an OIMComputed and forwards its value changes', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);
        const obj = new OIMReactiveObject<'a', number>(queue);
        obj.setProperty('a', 2);
        queue.flush();

        const computed = new OIMComputed<number>(runtime, {
            compute: () => (obj.get('a') ?? 0) * 10,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });

        const doubled = fromComputed(computed);
        expect(doubled.getValue()).toBe(20);

        let hits = 0;
        doubled.subscribe(() => hits++);
        obj.setProperty('a', 3);
        queue.flush();
        expect(hits).toBe(1);
        expect(doubled.getValue()).toBe(30);

        computed.destroy();
        queue.destroy();
    });
});
