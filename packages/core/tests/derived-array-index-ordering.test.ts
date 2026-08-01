import { OIMEventQueue } from '../src/core/OIMEventQueue';
import { createOIMCollectionKit } from '../src/dx/OIMCollectionKit';

type TRow = { id: string; group: string; rank: number; label: string };

/**
 * The derived array index maintains order incrementally: a bucket that only gained members is
 * merged into rather than re-sorted. These tests pin the observable contract of that optimisation —
 * the order must be indistinguishable from sorting the bucket from scratch, whatever mix of
 * inserts, moves and removals produced it.
 */
describe('derived array index ordering', () => {
    const build = () => {
        const queue = new OIMEventQueue();
        const kit = createOIMCollectionKit<TRow, string>(queue, {
            selectPk: r => r.id,
        });
        const index = kit.indexFactory.derivedArrayIndex<string>(
            r => r.group,
            { orderBy: r => r.rank }
        );
        return { queue, kit, index };
    };

    const expected = (rows: TRow[], group: string): string[] =>
        rows
            .filter(r => r.group === group)
            .sort((a, b) => a.rank - b.rank)
            .map(r => r.id);

    it('keeps order when members are appended one at a time', () => {
        const { queue, kit, index } = build();
        const rows: TRow[] = [];
        for (let i = 0; i < 50; i++) {
            // Ranks deliberately out of insertion order.
            const row = {
                id: `r${i}`,
                group: 'g',
                rank: (i * 37) % 50,
                label: `l${i}`,
            };
            rows.push(row);
            kit.collection.upsertOne(row);
            queue.flush();
            expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));
        }
    });

    it('keeps order when several members arrive in one flush', () => {
        const { queue, kit, index } = build();
        const rows: TRow[] = [];
        for (let batch = 0; batch < 10; batch++) {
            const incoming: TRow[] = [];
            for (let i = 0; i < 7; i++) {
                incoming.push({
                    id: `r${batch}-${i}`,
                    group: 'g',
                    rank: (batch * 7 + i * 13) % 71,
                    label: 'l',
                });
            }
            rows.push(...incoming);
            kit.collection.upsertMany(incoming);
            queue.flush();
            expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));
        }
    });

    it('re-sorts when an existing member moves', () => {
        const { queue, kit, index } = build();
        const rows: TRow[] = [];
        for (let i = 0; i < 20; i++) {
            rows.push({ id: `r${i}`, group: 'g', rank: i, label: 'l' });
        }
        kit.collection.upsertMany(rows);
        queue.flush();
        expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));

        // Move the last row to the front, then the first to the back.
        rows[19].rank = -5;
        kit.collection.upsertOne(rows[19]);
        queue.flush();
        expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));

        rows[0].rank = 99;
        kit.collection.upsertOne(rows[0]);
        queue.flush();
        expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));
    });

    it('keeps order when a move and an insert land in the same flush', () => {
        const { queue, kit, index } = build();
        const rows: TRow[] = [];
        for (let i = 0; i < 10; i++) {
            rows.push({ id: `r${i}`, group: 'g', rank: i * 2, label: 'l' });
        }
        kit.collection.upsertMany(rows);
        queue.flush();

        rows[8].rank = -1; // a move
        const fresh = { id: 'fresh', group: 'g', rank: 7, label: 'l' };
        rows.push(fresh);
        kit.collection.upsertMany([rows[8], fresh]);
        queue.flush();
        expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));
    });

    it('keeps order across removals mixed with inserts', () => {
        const { queue, kit, index } = build();
        let rows: TRow[] = [];
        for (let i = 0; i < 30; i++) {
            rows.push({ id: `r${i}`, group: 'g', rank: (i * 11) % 30, label: 'l' });
        }
        kit.collection.upsertMany(rows);
        queue.flush();

        for (let step = 0; step < 10; step++) {
            const doomed = rows[step * 2];
            kit.collection.removeManyByPks([doomed.id]);
            rows = rows.filter(r => r.id !== doomed.id);

            const fresh = {
                id: `fresh-${step}`,
                group: 'g',
                rank: (step * 7) % 30,
                label: 'l',
            };
            rows.push(fresh);
            kit.collection.upsertOne(fresh);
            queue.flush();
            expect(index.getPksByKey('g')).toEqual(expected(rows, 'g'));
        }
    });

    it('matches a from-scratch sort under a randomised write mix', () => {
        const { queue, kit, index } = build();
        // Deterministic PRNG: a failure must be reproducible.
        let seed = 123456789;
        const rand = (n: number) => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed % n;
        };

        const rows = new Map<string, TRow>();
        for (let step = 0; step < 400; step++) {
            const action = rand(3);
            if (action === 0 || rows.size === 0) {
                const row = {
                    id: `r${step}`,
                    group: `g${rand(3)}`,
                    rank: rand(100),
                    label: 'l',
                };
                rows.set(row.id, row);
                kit.collection.upsertOne(row);
            } else if (action === 1) {
                const ids = [...rows.keys()];
                const id = ids[rand(ids.length)];
                const row = { ...rows.get(id)!, rank: rand(100) };
                rows.set(id, row);
                kit.collection.upsertOne(row);
            } else {
                const ids = [...rows.keys()];
                const id = ids[rand(ids.length)];
                rows.delete(id);
                kit.collection.removeManyByPks([id]);
            }
            queue.flush();

            // Ties are ordered by the bucket's own history, not by the order this
            // test happens to hold rows in, so the contract asserted here is
            // "exactly the right members, in non-decreasing rank order" — the
            // strict id-by-id checks live in the append-only cases above, where
            // stability is well defined. (Verified against the pre-existing
            // implementation: it orders ties the same history-dependent way.)
            for (const group of ['g0', 'g1', 'g2']) {
                const pks = index.getPksByKey(group);
                expect([...pks].sort()).toEqual(
                    expected([...rows.values()], group).sort()
                );
                const ranks = pks.map(pk => rows.get(pk)!.rank);
                for (let i = 1; i < ranks.length; i++) {
                    expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
                }
            }
        }
    });

    it('keeps equal-ranked members stable in insertion order', () => {
        const { queue, kit, index } = build();
        const ids: string[] = [];
        for (let i = 0; i < 12; i++) {
            const id = `r${i}`;
            ids.push(id);
            kit.collection.upsertOne({ id, group: 'g', rank: 5, label: 'l' });
            queue.flush();
        }
        // Every member compares equal, so a binary insert must place each newcomer
        // after its equals — the same order a stable sort would produce.
        expect(index.getPksByKey('g')).toEqual(ids);
    });
});
