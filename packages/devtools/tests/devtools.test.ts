import { OIMDevRegistry } from '../src';

type User = { id: string; name: string; role: string };
type Task = { id: string; title: string; assigneeId: string };

function makeCollection<T extends object, TPk>(items: T[], getPk: (e: T) => TPk) {
    return {
        getAll: () => items as unknown[],
        getAllPks: () => items.map(getPk) as unknown[],
    };
}

function makeIndex(keys: string[]) {
    return { getKeys: () => keys };
}

describe('OIMDevRegistry', () => {
    test('registers a collection and returns it in inspect()', () => {
        const reg = new OIMDevRegistry();
        const users = makeCollection<User, string>(
            [{ id: 'u1', name: 'Alice', role: 'admin' }],
            (u) => u.id
        );

        reg.collection('users', users);

        const result = reg.inspect();
        expect(result.collections['users']).toBeDefined();
        expect(result.collections['users'].count).toBe(1);
        expect(result.collections['users'].samplePks).toEqual(['u1']);
    });

    test('inspect() includes sampleEntity fields', () => {
        const reg = new OIMDevRegistry();
        const users = makeCollection<User, string>(
            [{ id: 'u1', name: 'Alice', role: 'admin' }],
            (u) => u.id
        );

        reg.collection('users', users);
        const info = reg.inspect().collections['users'];

        expect(info.sampleEntity).toEqual({ id: 'u1', name: 'Alice', role: 'admin' });
    });

    test('inspect() includes all entities', () => {
        const reg = new OIMDevRegistry();
        const items = [
            { id: 'u1', name: 'Alice', role: 'admin' },
            { id: 'u2', name: 'Bob',   role: 'user' },
        ];
        const users = makeCollection<User, string>(items, (u) => u.id);

        reg.collection('users', users);
        const info = reg.inspect().collections['users'];

        expect(info.entities).toEqual(items);
    });

    test('inspect() includes empty history by default', () => {
        const reg = new OIMDevRegistry();
        const result = reg.inspect();
        expect(result.history).toEqual([]);
    });

    test('trackFlushes() records flush history', () => {
        const reg = new OIMDevRegistry();
        const items: User[] = [{ id: 'u1', name: 'Alice', role: 'admin' }];
        const users = makeCollection<User, string>(items, (u) => u.id);
        reg.collection('users', users);

        const handlers: Array<() => void> = [];
        const off = reg.trackFlushes((handler) => {
            handlers.push(handler);
            return () => { handlers.splice(handlers.indexOf(handler), 1); };
        });

        handlers.forEach(h => h());
        items.push({ id: 'u2', name: 'Bob', role: 'user' });
        handlers.forEach(h => h());

        const history = reg.inspect().history;
        expect(history).toHaveLength(2);
        expect(history[0].counts['users']).toBe(2);
        expect(history[1].counts['users']).toBe(1);

        off();
    });

    test('inspect() includes index key counts', () => {
        const reg = new OIMDevRegistry();
        const tasks = makeCollection<Task, string>(
            [
                { id: 't1', title: 'Design', assigneeId: 'u1' },
                { id: 't2', title: 'Implement', assigneeId: 'u1' },
                { id: 't3', title: 'Review', assigneeId: 'u2' },
            ],
            (t) => t.id
        );

        reg.collection('tasks', tasks, {
            indexes: { byAssignee: makeIndex(['u1', 'u2']) },
        });

        const info = reg.inspect().collections['tasks'];
        expect(info.indexes['byAssignee'].keyCount).toBe(2);
        expect(info.indexes['byAssignee'].keys).toEqual(['u1', 'u2']);
    });

    test('inspect() includes relations', () => {
        const reg = new OIMDevRegistry();
        const tasks = makeCollection<Task, string>([], (t) => t.id);

        reg.collection('tasks', tasks, {
            relations: { assigneeId: 'users' },
        });

        const info = reg.inspect().collections['tasks'];
        expect(info.relations).toEqual({ assigneeId: 'users' });
    });

    test('inspect() includes optional description', () => {
        const reg = new OIMDevRegistry();
        const users = makeCollection<User, string>([], (u) => u.id);

        reg.collection('users', users, { description: 'Registered app users' });

        const info = reg.inspect().collections['users'];
        expect(info.description).toBe('Registered app users');
    });

    test('samplePks caps at 5 entries', () => {
        const reg = new OIMDevRegistry();
        const items = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, name: '', role: '' }));
        const col = makeCollection<User, string>(items, (u) => u.id);

        reg.collection('users', col);
        expect(reg.inspect().collections['users'].samplePks).toHaveLength(5);
    });

    test('sampleEntity is null for empty collection', () => {
        const reg = new OIMDevRegistry();
        const col = makeCollection<User, string>([], (u) => u.id);

        reg.collection('users', col);
        expect(reg.inspect().collections['users'].sampleEntity).toBeNull();
    });

    test('collection() is chainable and registers multiple collections', () => {
        const reg = new OIMDevRegistry();
        const users = makeCollection<User, string>([], (u) => u.id);
        const tasks = makeCollection<Task, string>([], (t) => t.id);

        reg.collection('users', users).collection('tasks', tasks);

        const result = reg.inspect();
        expect(Object.keys(result.collections)).toEqual(['users', 'tasks']);
    });

    test('dump() calls console.log without throwing', () => {
        const reg = new OIMDevRegistry();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const users = makeCollection<User, string>(
            [{ id: 'u1', name: 'Alice', role: 'admin' }],
            (u) => u.id
        );
        reg.collection('users', users, {
            indexes: { byRole: makeIndex(['admin', 'member']) },
            relations: { teamId: 'teams' },
            description: 'App users',
        });

        expect(() => reg.dump()).not.toThrow();
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });

    test('exported singleton registry is an OIMDevRegistry instance', () => {
        const { registry } = require('../src');
        expect(registry).toBeInstanceOf(OIMDevRegistry);
    });
});

describe('OIMDevRegistry — computeds', () => {
    function makeComputed(opts: { isReady: boolean; needsRecompute: boolean; value: unknown }) {
        return {
            isReady: opts.isReady,
            needsRecompute: opts.needsRecompute,
            getIfReady: () => (opts.isReady ? opts.value : undefined),
        };
    }

    test('registered computed appears in inspect()', () => {
        const reg = new OIMDevRegistry();
        reg.computed('taskCount', makeComputed({ isReady: true, needsRecompute: false, value: 5 }));

        const result = reg.inspect();
        expect(result.computeds['taskCount']).toMatchObject({
            isReady: true,
            needsRecompute: false,
            currentValue: 5,
        });
    });

    test('not-yet-computed shows isReady: false', () => {
        const reg = new OIMDevRegistry();
        reg.computed('total', makeComputed({ isReady: false, needsRecompute: true, value: undefined }));

        const info = reg.inspect().computeds['total'];
        expect(info.isReady).toBe(false);
        expect(info.currentValue).toBeUndefined();
    });

    test('stale computed shows needsRecompute: true with last known value', () => {
        const reg = new OIMDevRegistry();
        reg.computed('price', makeComputed({ isReady: true, needsRecompute: true, value: 42 }));

        const info = reg.inspect().computeds['price'];
        expect(info.needsRecompute).toBe(true);
        expect(info.currentValue).toBe(42);
    });

    test('computed() is chainable', () => {
        const reg = new OIMDevRegistry();
        const comp = makeComputed({ isReady: true, needsRecompute: false, value: 0 });

        reg.computed('a', comp).computed('b', comp);
        expect(Object.keys(reg.inspect().computeds)).toEqual(['a', 'b']);
    });

    test('inspect() returns empty computeds when none registered', () => {
        const reg = new OIMDevRegistry();
        expect(reg.inspect().computeds).toEqual({});
    });

    test('deps resolved to registered names via WeakMap', () => {
        const reg = new OIMDevRegistry();

        const subtotal = makeComputed({ isReady: true, needsRecompute: false, value: 200 });
        const settings = { getAll: () => [], getAllPks: () => [] };

        reg.computed('subtotal', subtotal);
        reg.collection('settings', settings);

        // computed that depends on subtotal (registered) and rawDep (not registered)
        const rawDep = { source: {} }; // unregistered source
        const total = {
            ...makeComputed({ isReady: true, needsRecompute: false, value: 240 }),
            deps: [
                { source: subtotal },      // registered as 'subtotal'
                rawDep,                    // not in registry
            ],
        };

        reg.computed('total', total);

        const info = reg.inspect().computeds['total'];
        expect(info.deps[0].name).toBe('subtotal');
        expect(info.deps[1].name).toBeNull();
    });

    test('deps is empty array when computed has no deps property', () => {
        const reg = new OIMDevRegistry();
        const comp = makeComputed({ isReady: true, needsRecompute: false, value: 0 });
        // no .deps property — treated as no deps
        reg.computed('simple', comp);
        expect(reg.inspect().computeds['simple'].deps).toEqual([]);
    });

    test('collection indexes are added to WeakMap under collectionName.indexName', () => {
        const reg = new OIMDevRegistry();
        const col = { getAll: () => [], getAllPks: () => [] };
        const idx = { getKeys: () => ['a', 'b'] };

        reg.collection('tasks', col, { indexes: { byStatus: idx } });

        // A computed dep that wraps the index source should resolve to 'tasks.byStatus'
        const comp = {
            ...makeComputed({ isReady: true, needsRecompute: false, value: null }),
            deps: [{ source: idx }],
        };
        reg.computed('tasksByStatus', comp);

        const info = reg.inspect().computeds['tasksByStatus'];
        expect(info.deps[0].name).toBe('tasks.byStatus');
    });
});
