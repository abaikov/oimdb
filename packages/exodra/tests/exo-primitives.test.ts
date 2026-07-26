import {
    OIMComputed,
    OIMComputeRuntime,
    OIMEffectDependencyKeyedObject,
    OIMEventQueue,
    OIMOrderedListCommandStream,
    OIMReactiveObject,
    createInPlaceEntityUpdater,
    createOIMCollectionKit,
} from '@oimdb/core';
import type { TExoListOp } from '@exodra/reactivity-types';
import { exoBindable, exoChildren, exoCombine, exoList } from '../src';

type User = { id: string; name: string; teamId: string };
type Card = { id: string; deckId: string; position: number };

/** Minimal writable bindable: the bridge depends on types only, so tests do not pull the runtime. */
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

const makeUsers = () => {
    const queue = new OIMEventQueue();
    const kit = createOIMCollectionKit<User, string>(queue, {
        selectPk: u => u.id,
    });
    return { queue, kit };
};

describe('exoBindable', () => {
    test('raw pair: lazy, ref-counted, forwards every emit', () => {
        const value = 1;
        let subscribeCount = 0;
        let active = 0;
        let notify: () => void = () => undefined;

        const source = exoBindable(
            () => value,
            onChange => {
                subscribeCount++;
                active++;
                notify = onChange;
                return () => active--;
            }
        );

        expect(subscribeCount).toBe(0); // getValue alone never subscribes
        expect(source.getValue()).toBe(1);

        let hits = 0;
        const a = source.subscribe(() => hits++);
        const b = source.subscribe(() => undefined);
        expect(subscribeCount).toBe(1); // second subscriber does NOT re-subscribe upstream

        notify();
        notify();
        expect(hits).toBe(2); // identical value still forwarded — the source decides, not the bridge

        a();
        expect(active).toBe(1);
        b();
        expect(active).toBe(0); // last subscriber gone → upstream torn down
    });

    test('raw pair: an in-place entity update reaches the subscriber (stable ref)', () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
            updateEntity: createInPlaceEntityUpdater(),
        });
        kit.collection.upsertOne({ id: 'u1', name: 'a', teamId: 't1' });
        queue.flush();

        const user = exoBindable(
            () => kit.collection.getOneByPk('u1'),
            onChange => kit.collection.subscribeOnKey('u1', onChange)
        );
        let hits = 0;
        user.subscribe(() => hits++);

        kit.collection.upsertOne({ id: 'u1', name: 'b', teamId: 't1' });
        queue.flush();

        expect(hits).toBe(1);
        expect(user.getValue()?.name).toBe('b');
    });

    test('selector overload', () => {
        const { queue, kit } = makeUsers();
        kit.collection.upsertOne({ id: 'u1', name: 'Alice', teamId: 't1' });
        queue.flush();

        const user = exoBindable(kit.select.byPk('u1'));
        expect(user.getValue()?.name).toBe('Alice');

        let hits = 0;
        user.subscribe(() => hits++);
        kit.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();
        expect(hits).toBe(1);
        expect(user.getValue()?.name).toBe('Ally');
    });

    test('computed overload', () => {
        const queue = new OIMEventQueue();
        const runtime = new OIMComputeRuntime(queue);
        const obj = new OIMReactiveObject<'a', number>(queue);
        obj.setProperty('a', 2);
        queue.flush();

        const computed = new OIMComputed<number>(runtime, {
            compute: () => (obj.get('a') ?? 0) * 10,
            deps: [new OIMEffectDependencyKeyedObject(obj, 'a')],
        });
        const doubled = exoBindable(computed);
        expect(doubled.getValue()).toBe(20);

        let hits = 0;
        doubled.subscribe(() => hits++);
        obj.setProperty('a', 3);
        queue.flush();
        expect(hits).toBe(1);
        expect(doubled.getValue()).toBe(30);
    });

    test('reactive key: repoints, and an unsubscribed read follows the CURRENT key', () => {
        const { queue, kit } = makeUsers();
        kit.collection.upsertMany([
            { id: 'u1', name: 'Alice', teamId: 't1' },
            { id: 'u2', name: 'Bob', teamId: 't1' },
        ]);
        queue.flush();

        const pk = testBindable<string>('u1');
        const user = exoBindable(pk, (k: string) => kit.select.byPk(k));

        // Nobody subscribed → nothing tracks the key, but the read must still resolve it.
        expect(user.getValue()?.name).toBe('Alice');
        pk.setValue('u2');
        expect(user.getValue()?.name).toBe('Bob');

        let hits = 0;
        user.subscribe(() => hits++);
        pk.setValue('u1');
        expect(hits).toBe(1);
        expect(user.getValue()?.name).toBe('Alice');
    });

    test('rejects a single argument that is neither selector nor computed', () => {
        expect(() => exoBindable({} as never)).toThrow(/OIMSelector or an OIMComputed/);
    });
});

describe('exoCombine', () => {
    test('ref-counted, and collapses N source emits for one logical change', () => {
        let notifyA: () => void = () => undefined;
        let notifyB: () => void = () => undefined;
        let subs = 0;
        let value = 0;

        const mk = (assign: (fn: () => void) => void) =>
            exoBindable(
                () => value,
                on => {
                    subs++;
                    assign(on);
                    return () => subs--;
                }
            );
        const a = mk(fn => (notifyA = fn));
        const b = mk(fn => (notifyB = fn));

        const sum = exoCombine([a, b], () => value);
        const stopA = sum.subscribe(() => undefined);
        const stopB = sum.subscribe(() => undefined);
        expect(subs).toBe(2); // two sources, NOT two per subscriber

        let hits = 0;
        sum.subscribe(() => hits++);
        value = 1;
        notifyA();
        notifyB();
        expect(hits).toBe(1); // the redundant recompute lands on the same value

        stopA();
        stopB();
    });
});

describe('exoChildren', () => {
    test('idempotent read, cached rows, duplicate key throws', () => {
        let order: readonly string[] = ['a', 'b'];
        const source = {
            getValue: () => order,
            subscribe: () => () => undefined,
        };

        let renders = 0;
        const rows = exoChildren<string, { k: string }>(source, {
            key: k => k,
            render: k => {
                renders++;
                return { k };
            },
        });

        const first = rows.getValue();
        expect(renders).toBe(2);
        expect(rows.getValue()).toBe(first); // same reference, no re-render, no eviction
        expect(renders).toBe(2);

        order = ['a', 'b', 'c'];
        const grown = rows.getValue();
        expect(grown).not.toBe(first);
        expect(grown[0]).toBe(first[0]); // survivors keep identity
        expect(renders).toBe(3); // only the new key rendered

        order = ['a', 'a'];
        expect(() => rows.getValue()).toThrow(/duplicate key a at index 1/);
    });
});

describe('exoList', () => {
    const slot = (id: string) => ({
        pk: id,
        item: { id, deckId: 'd1', position: 0 },
    });

    test('maps every command kind and preserves the optional count', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, Card>(queue);
        stream.pushSlot('d1', slot('c1'));
        stream.pushSlot('d1', slot('c2'));
        stream.pushSlot('d1', slot('c3'));
        queue.flush();

        const list = exoList(stream, 'd1', s => ({ pk: s.pk }));
        const ops: TExoListOp<{ pk: string }>[] = [];
        const stop = list.subscribeOps(op => ops.push(op));

        stream.setSlotAt('d1', 1, slot('c9'));
        queue.flush();
        expect(ops).toEqual([{ type: 'set', index: 1, item: { pk: 'c9' } }]);

        // removeAt emits no count (1 on both sides) — it must stay absent, not become 0/NaN
        ops.length = 0;
        stream.removeAt('d1', 0);
        queue.flush();
        expect(ops[0]).toMatchObject({ type: 'remove', index: 0 });
        expect((ops[0] as { count?: number }).count).toBeUndefined();

        ops.length = 0;
        stream.removeRange('d1', 0, 2);
        queue.flush();
        expect(ops).toEqual([{ type: 'remove', index: 0, count: 2 }]);

        ops.length = 0;
        stream.setSlots('d1', [slot('z1'), slot('z2')]);
        queue.flush();
        expect(ops).toEqual([
            { type: 'reset', items: [{ pk: 'z1' }, { pk: 'z2' }] },
        ]);

        stop();
    });

    test('snapshot keeps row identity and renders each row once', () => {
        const queue = new OIMEventQueue();
        const stream = new OIMOrderedListCommandStream<string, string, Card>(queue);
        stream.pushSlot('d1', slot('c1'));
        stream.pushSlot('d1', slot('c2'));
        queue.flush();

        let renders = 0;
        const list = exoList(stream, 'd1', s => {
            renders++;
            return { pk: s.pk };
        });

        const first = list.snapshot();
        const second = list.snapshot();
        expect(renders).toBe(2); // NOT re-rendered per read
        expect(second[0]).toBe(first[0]); // identity is what Exodra reconciles on
    });
});
