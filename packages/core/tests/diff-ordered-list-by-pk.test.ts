import { diffOrderedListByPk } from '../src/modules/wrapper/index/diffOrderedListByPk';
import { TOIMOrderedListCommand } from '../src/modules/wrapper/index/TOIMOrderedListCommand';

type Item = { pk: string };
const item = (pk: string): Item => ({ pk });
const items = (...pks: string[]): Item[] => pks.map(item);
const pks = (arr: readonly Item[]): string[] => arr.map(i => i.pk);

/** Reference consumer: apply position-addressed commands to an array. */
function applyCommands(
    arr: readonly Item[],
    cmds: readonly TOIMOrderedListCommand<Item>[]
): Item[] {
    let out = arr.slice();
    for (const c of cmds) {
        switch (c.type) {
            case 'insert':
                out.splice(c.index, 0, c.item);
                break;
            case 'remove':
                out.splice(c.index, c.count ?? 1);
                break;
            case 'move': {
                const seg = out.splice(c.from, c.count ?? 1);
                out.splice(c.to, 0, ...seg);
                break;
            }
            case 'set':
                out.splice(c.index, 1, c.item);
                break;
            case 'reset':
                out = c.items.slice();
                break;
        }
    }
    return out;
}

const countType = (
    cmds: readonly TOIMOrderedListCommand<Item>[],
    type: string
): number => cmds.filter(c => c.type === type).length;

describe('diffOrderedListByPk', () => {
    test('identical lists → no commands', () => {
        expect(diffOrderedListByPk(items('a', 'b', 'c'), items('a', 'b', 'c')))
            .toEqual([]);
    });

    test('pure append → insert at end', () => {
        const cmds = diffOrderedListByPk(items('a', 'b'), items('a', 'b', 'c'));
        expect(cmds).toEqual([{ type: 'insert', index: 2, item: item('c') }]);
    });

    test('insert in the middle → single insert, no moves', () => {
        const cmds = diffOrderedListByPk(items('a', 'b'), items('a', 'x', 'b'));
        expect(countType(cmds, 'insert')).toBe(1);
        expect(countType(cmds, 'move')).toBe(0);
        expect(pks(applyCommands(items('a', 'b'), cmds))).toEqual([
            'a',
            'x',
            'b',
        ]);
    });

    test('single remove', () => {
        const cmds = diffOrderedListByPk(items('a', 'b', 'c'), items('a', 'c'));
        expect(countType(cmds, 'remove')).toBe(1);
        expect(pks(applyCommands(items('a', 'b', 'c'), cmds))).toEqual([
            'a',
            'c',
        ]);
    });

    test('rotate [a,b,c] → [b,c,a] costs exactly one move (LIS keeps b,c)', () => {
        const prev = items('a', 'b', 'c');
        const next = items('b', 'c', 'a');
        const cmds = diffOrderedListByPk(prev, next);
        expect(countType(cmds, 'move')).toBe(1);
        expect(pks(applyCommands(prev, cmds))).toEqual(['b', 'c', 'a']);
    });

    test('rotate [a,b,c] → [c,a,b] costs exactly one move (LIS keeps a,b)', () => {
        const prev = items('a', 'b', 'c');
        const next = items('c', 'a', 'b');
        const cmds = diffOrderedListByPk(prev, next);
        expect(countType(cmds, 'move')).toBe(1);
        expect(pks(applyCommands(prev, cmds))).toEqual(['c', 'a', 'b']);
    });

    test('minimality: reversing n items costs n-1 moves (LIS = 1)', () => {
        const src = 'abcdefgh'.split('');
        const prev = items(...src);
        const next = items(...src.slice().reverse());
        const cmds = diffOrderedListByPk(prev, next);
        expect(countType(cmds, 'move')).toBe(src.length - 1);
        expect(pks(applyCommands(prev, cmds))).toEqual(src.slice().reverse());
    });

    test('reverse [a,b,c,d] → [d,c,b,a] is correct', () => {
        const prev = items('a', 'b', 'c', 'd');
        const next = items('d', 'c', 'b', 'a');
        const cmds = diffOrderedListByPk(prev, next);
        expect(pks(applyCommands(prev, cmds))).toEqual(['d', 'c', 'b', 'a']);
    });

    test('mixed add + remove + move', () => {
        const prev = items('a', 'b', 'c', 'd');
        const next = items('e', 'c', 'a', 'f'); // remove b,d; add e,f; reorder
        const cmds = diffOrderedListByPk(prev, next);
        expect(pks(applyCommands(prev, cmds))).toEqual(['e', 'c', 'a', 'f']);
    });

    test('empty prev → all inserts', () => {
        const cmds = diffOrderedListByPk(items(), items('a', 'b'));
        expect(countType(cmds, 'insert')).toBe(2);
        expect(pks(applyCommands(items(), cmds))).toEqual(['a', 'b']);
    });

    test('empty next → all removes', () => {
        const cmds = diffOrderedListByPk(items('a', 'b'), items());
        expect(countType(cmds, 'remove')).toBe(2);
        expect(pks(applyCommands(items('a', 'b'), cmds))).toEqual([]);
    });

    test('minimality property: pure permutation costs (n - LIS) moves', () => {
        // Independent LIS length over the permutation prev→next: for each next
        // item, its index in prev; the LIS of that sequence stays put.
        const lisLength = (arr: number[]): number => {
            const tails: number[] = [];
            for (const x of arr) {
                let lo = 0;
                let hi = tails.length;
                while (lo < hi) {
                    const mid = (lo + hi) >> 1;
                    if (tails[mid] < x) lo = mid + 1;
                    else hi = mid;
                }
                if (lo === tails.length) tails.push(x);
                else tails[lo] = x;
            }
            return tails.length;
        };

        let state = 987654321;
        const rnd = () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
        const universe = 'abcdefghij'.split('');

        for (let iter = 0; iter < 500; iter++) {
            const permPks = universe.slice();
            for (let i = permPks.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [permPks[i], permPks[j]] = [permPks[j], permPks[i]];
            }
            const prev = items(...universe);
            const next = items(...permPks);
            const cmds = diffOrderedListByPk(prev, next);

            const prevIndex = new Map(universe.map((c, i) => [c, i]));
            const seq = permPks.map(c => prevIndex.get(c)!);
            const expectedMoves = universe.length - lisLength(seq);

            expect(countType(cmds, 'move')).toBe(expectedMoves);
            expect(pks(applyCommands(prev, cmds))).toEqual(permPks);
        }
    });

    test('property: apply(prev, diff(prev,next)) === next for random cases', () => {
        // Deterministic PRNG (Date.now/Math.random are unavailable in this env
        // anyway); seeded LCG so the run is reproducible.
        let state = 123456789;
        const rnd = () => {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
        const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
        const shuffle = <T>(arr: T[]): T[] => {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        };

        const universe = 'abcdefghijklmnopqrstuvwxyz'.split('');

        for (let iter = 0; iter < 2000; iter++) {
            const prevPks = shuffle(universe).slice(
                0,
                Math.floor(rnd() * universe.length)
            );
            // next = random subset of prev (some removed) + some new, shuffled
            const kept = prevPks.filter(() => rnd() > 0.35);
            const added = shuffle(
                universe.filter(c => !prevPks.includes(c))
            ).slice(0, Math.floor(rnd() * 5));
            const nextPks = shuffle([...kept, ...added]);

            const prev = items(...prevPks);
            const next = items(...nextPks);
            const cmds = diffOrderedListByPk(prev, next);

            expect(pks(applyCommands(prev, cmds))).toEqual(nextPks);
        }
    });
});
