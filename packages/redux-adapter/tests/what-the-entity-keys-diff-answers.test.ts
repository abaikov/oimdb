import { oimDiffEntityKeys } from '../src';

describe('oimDiffEntityKeys', () => {
    test('classifies added, updated and removed keys by reference', () => {
        const a = { id: '1' };
        const b = { id: '2' };
        const oldEntities: Record<string, { id: string }> = { '1': a, '2': b };
        const newEntities: Record<string, { id: string }> = { '1': { id: '1' }, '3': { id: '3' } };

        const result = oimDiffEntityKeys(oldEntities, newEntities);
        expect(result.added).toEqual(new Set(['3']));
        expect(result.updated).toEqual(new Set(['1']));
        expect(result.removed).toEqual(new Set(['2']));
        expect(result.all).toEqual(new Set(['1', '2', '3']));
    });

    test('an entity kept by the same reference is neither added nor updated', () => {
        const shared = { id: '1' };
        const result = oimDiffEntityKeys({ '1': shared }, { '1': shared });
        expect(result.all.size).toBe(0);
    });

    test('a numerically keyed record reports STRINGS, because that is what it holds', () => {
        const one = { id: 1 };
        const oldEntities: Record<number, { id: number }> = { 1: one };
        const newEntities: Record<number, { id: number }> = { 1: one, 2: { id: 2 } };

        const result = oimDiffEntityKeys(oldEntities, newEntities);

        // A plain object files `2` under `'2'`, so the keys are strings, not the
        // population's pks: handed to a `Map`-backed store, `'2'` addresses nothing.
        // A signature that widens these keys has to argue with this fact.
        expect(result.added).toEqual(new Set(['2']));
        expect(result.added.has(2 as unknown as string)).toBe(false);
    });
});
