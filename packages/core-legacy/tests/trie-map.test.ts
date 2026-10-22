import { OIMTrieMap } from '../src';

describe('OIMTrieMap', () => {
    test('matches paths by content, not reference', () => {
        const trie = new OIMTrieMap<string | number, string>();
        trie.set(['a', 1, 'x'], 'value');

        // A freshly built path with equal content resolves to the same value.
        expect(trie.get(['a', 1, 'x'])).toBe('value');
        expect(trie.has(['a', 1, 'x'])).toBe(true);
        expect(trie.get(['a', 1, 'y'])).toBeUndefined();
    });

    test('keeps segment types distinct (1 !== "1")', () => {
        const trie = new OIMTrieMap<string | number, string>();
        trie.set([1], 'number');
        trie.set(['1'], 'string');

        expect(trie.get([1])).toBe('number');
        expect(trie.get(['1'])).toBe('string');
        expect(trie.size).toBe(2);
    });

    test('paths of different lengths coexist without collision', () => {
        const trie = new OIMTrieMap<string, string>();
        trie.set(['a', 'b'], 'two');
        trie.set(['a', 'b', 'c'], 'three');

        expect(trie.get(['a', 'b'])).toBe('two');
        expect(trie.get(['a', 'b', 'c'])).toBe('three');
        expect(trie.size).toBe(2);
    });

    test('no separator collision that string keys would suffer', () => {
        const trie = new OIMTrieMap<string, string>();
        trie.set(['a|b', 'c'], 'first');
        trie.set(['a', 'b|c'], 'second');

        // A "a|b|c" stringified key would collapse these; the trie does not.
        expect(trie.get(['a|b', 'c'])).toBe('first');
        expect(trie.get(['a', 'b|c'])).toBe('second');
        expect(trie.size).toBe(2);
    });

    test('overwriting a terminal does not grow size', () => {
        const trie = new OIMTrieMap<string, number>();
        trie.set(['a'], 1);
        trie.set(['a'], 2);
        expect(trie.get(['a'])).toBe(2);
        expect(trie.size).toBe(1);
    });

    test('delete removes the value and prunes empty branches', () => {
        const trie = new OIMTrieMap<string, string>();
        trie.set(['a', 'b', 'c'], 'deep');
        trie.set(['a', 'b'], 'mid');

        expect(trie.delete(['a', 'b', 'c'])).toBe(true);
        expect(trie.get(['a', 'b', 'c'])).toBeUndefined();
        // The shorter path sharing the prefix survives.
        expect(trie.get(['a', 'b'])).toBe('mid');
        expect(trie.size).toBe(1);

        expect(trie.delete(['a', 'b'])).toBe(true);
        expect(trie.size).toBe(0);
        // Deleting a missing path is a no-op.
        expect(trie.delete(['a', 'b'])).toBe(false);
    });

    test('entries / keys / values iterate every stored path', () => {
        const trie = new OIMTrieMap<string, number>();
        trie.set(['a'], 1);
        trie.set(['a', 'b'], 2);
        trie.set(['c'], 3);

        const entries = Array.from(trie.entries()).sort((x, y) =>
            x[1] - y[1]
        );
        expect(entries).toEqual([
            [['a'], 1],
            [['a', 'b'], 2],
            [['c'], 3],
        ]);
        expect(Array.from(trie.values()).sort()).toEqual([1, 2, 3]);
        expect(Array.from(trie.keys())).toHaveLength(3);
    });

    test('supports an empty path as the root value', () => {
        const trie = new OIMTrieMap<string, string>();
        trie.set([], 'root');
        expect(trie.get([])).toBe('root');
        expect(trie.size).toBe(1);
        trie.delete([]);
        expect(trie.get([])).toBeUndefined();
        expect(trie.size).toBe(0);
    });

    test('clear empties the trie', () => {
        const trie = new OIMTrieMap<string, number>();
        trie.set(['a'], 1);
        trie.set(['b', 'c'], 2);
        trie.clear();
        expect(trie.size).toBe(0);
        expect(trie.get(['a'])).toBeUndefined();
        expect(Array.from(trie.entries())).toEqual([]);
    });
});
