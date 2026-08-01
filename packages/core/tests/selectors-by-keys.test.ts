import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { OIMReactiveObject } from '../src/core/OIMReactiveObject';
import { createOIMCollectionKit } from '../src/dx/OIMCollectionKit';
import { getOIMComputeRuntime } from '../src/dx/getOIMComputeRuntime';
import { OIMCollectionByPksSelector } from '../src/modules/selector/core/OIMCollectionByPksSelector';
import { OIMIndexPksByKeyArrayBasedSelector } from '../src/modules/selector/core/OIMIndexPksByKeyArrayBasedSelector';
import { OIMIndexPksByKeySetBasedSelector } from '../src/modules/selector/core/OIMIndexPksByKeySetBasedSelector';
import { OIMIndexPksByKeysArrayBasedSelector } from '../src/modules/selector/core/OIMIndexPksByKeysArrayBasedSelector';
import { OIMIndexPksByKeysSetBasedSelector } from '../src/modules/selector/core/OIMIndexPksByKeysSetBasedSelector';
import { OIMObjectValuesByKeysSelector } from '../src/modules/selector/core/OIMObjectValuesByKeysSelector';

type User = { id: string; team: string; name: string };

/**
 * The pks-and-values selectors: shipped, reachable, and until now barely exercised. Each one is
 * checked for the same three things — the value it reads, that a relevant change wakes a watcher,
 * and that its own `areEqual` swallows a change that leaves the value the same.
 */
describe('by-key(s) selectors', () => {
    const setup = () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<User, string>(queue, {
            selectPk: u => u.id,
        });
        const bySetTeam = kit.indexFactory.derivedSetIndex<string>(u => u.team);
        const byArrayTeam = kit.indexFactory.derivedArrayIndex<string>(
            u => u.team,
            { orderBy: u => u.name }
        );
        kit.collection.upsertMany([
            { id: 'u1', team: 't1', name: 'Alice' },
            { id: 'u2', team: 't1', name: 'Bob' },
            { id: 'u3', team: 't2', name: 'Cara' },
        ]);
        queue.flush();
        return {
            queue,
            kit,
            bySetTeam,
            byArrayTeam,
            runtime: getOIMComputeRuntime(queue),
        };
    };

    test('pks by one key, set-based: reads, wakes on membership, ignores a field edit', () => {
        const { queue, kit, bySetTeam, runtime } = setup();
        const selector = new OIMIndexPksByKeySetBasedSelector(
            runtime,
            bySetTeam,
            't1'
        );

        expect([...selector.getValue()].sort()).toEqual(['u1', 'u2']);

        let hits = 0;
        const stop = selector.watch(() => hits++);
        hits = 0; // `watch` calls back immediately with the current value

        kit.collection.upsertOneByPk('u1', { name: 'Ally' }); // membership untouched
        queue.flush();
        expect(hits).toBe(0);

        kit.collection.upsertOne({ id: 'u4', team: 't1', name: 'Dan' });
        queue.flush();
        expect(hits).toBe(1);
        expect([...selector.getValue()].sort()).toEqual(['u1', 'u2', 'u4']);

        stop();
        queue.destroy();
    });

    test('pks by one key, array-based: order comes from the index', () => {
        const { queue, kit, byArrayTeam, runtime } = setup();
        const selector = new OIMIndexPksByKeyArrayBasedSelector(
            runtime,
            byArrayTeam,
            't1'
        );

        expect(selector.getValue()).toEqual(['u1', 'u2']); // ordered by name

        let hits = 0;
        selector.watch(() => hits++);
        hits = 0;

        kit.collection.upsertOne({ id: 'u4', team: 't1', name: 'Aaron' });
        queue.flush();
        expect(hits).toBe(1);
        expect(selector.getValue()).toEqual(['u4', 'u1', 'u2']);

        queue.destroy();
    });

    test('pks by several keys, set-based: concatenates the buckets', () => {
        const { queue, kit, bySetTeam, runtime } = setup();
        const selector = new OIMIndexPksByKeysSetBasedSelector(
            runtime,
            bySetTeam,
            ['t1', 't2']
        );

        expect([...selector.getValue()].sort()).toEqual(['u1', 'u2', 'u3']);

        let hits = 0;
        selector.watch(() => hits++);
        hits = 0;

        // A change under the SECOND key must wake it too.
        kit.collection.upsertOne({ id: 'u5', team: 't2', name: 'Eve' });
        queue.flush();
        expect(hits).toBe(1);
        expect([...selector.getValue()].sort()).toEqual([
            'u1',
            'u2',
            'u3',
            'u5',
        ]);

        // A change under a key it does not watch must not.
        kit.collection.upsertOne({ id: 'u6', team: 't9', name: 'Zed' });
        queue.flush();
        expect(hits).toBe(1);

        queue.destroy();
    });

    test('pks by several keys, array-based', () => {
        const { queue, kit, byArrayTeam, runtime } = setup();
        const selector = new OIMIndexPksByKeysArrayBasedSelector(
            runtime,
            byArrayTeam,
            ['t1', 't2']
        );

        expect(selector.getValue()).toEqual(['u1', 'u2', 'u3']);

        let hits = 0;
        selector.watch(() => hits++);
        hits = 0;

        kit.collection.removeOneByPk('u3');
        queue.flush();
        expect(hits).toBe(1);
        expect(selector.getValue()).toEqual(['u1', 'u2']);

        queue.destroy();
    });

    test('entities by pks: length-aligned with holes, dedupes an unrelated change', () => {
        const { queue, kit, runtime } = setup();
        const selector = new OIMCollectionByPksSelector(
            runtime,
            kit.collection,
            ['u1', 'missing', 'u3']
        );

        const value = selector.getValue();
        expect(value).toHaveLength(3);
        expect(value[0]?.name).toBe('Alice');
        expect(value[1]).toBeUndefined();
        expect(value[2]?.name).toBe('Cara');

        let hits = 0;
        selector.watch(() => hits++);
        hits = 0;

        kit.collection.upsertOneByPk('u2', { name: 'Bobby' }); // not in the pk list
        queue.flush();
        expect(hits).toBe(0);

        kit.collection.upsertOneByPk('u1', { name: 'Ally' });
        queue.flush();
        expect(hits).toBe(1);
        expect(selector.getValue()[0]?.name).toBe('Ally');

        queue.destroy();
    });

    test('object values by keys: reads in order, wakes only on a watched key', () => {
        const queue = new OIMEventQueue();
        const runtime = getOIMComputeRuntime(queue);
        const settings = new OIMReactiveObject<'theme' | 'lang' | 'other', string>(
            queue
        );
        settings.setProperty('theme', 'dark');
        settings.setProperty('lang', 'en');
        settings.setProperty('other', 'x');
        queue.flush();

        const selector = new OIMObjectValuesByKeysSelector(runtime, settings, [
            'theme',
            'lang',
            'missing' as 'theme',
        ]);

        expect(selector.getValue()).toEqual(['dark', 'en', undefined]);

        let hits = 0;
        selector.watch(() => hits++);
        hits = 0;

        settings.setProperty('other', 'y'); // not watched
        queue.flush();
        expect(hits).toBe(0);

        settings.setProperty('lang', 'ru');
        queue.flush();
        expect(hits).toBe(1);
        expect(selector.getValue()).toEqual(['dark', 'ru', undefined]);

        queue.destroy();
    });
});
