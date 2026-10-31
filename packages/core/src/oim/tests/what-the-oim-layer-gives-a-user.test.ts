import * as oim from '../oim';

type TCard = { id: string; deck: string; title: string; rank: number };

const settle = (): Promise<void> => Promise.resolve();

describe('what the oim layer gives a user', () => {
    it('keeps entities in one default db that flushes by itself', async () => {
        const cards = oim.entities<TCard>();
        const seen: string[] = [];
        oim.effect(() => { seen.push(cards.getEntityByKey('c1')?.title ?? '-'); });
        cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        await settle();
        expect(cards.updateEntityByKey('c1', { title: 'Ace of spades' })).toBe(true);
        await settle();
        expect(cards.deleteEntityByKey('c1')).toBe(true);
        await settle();
        expect(cards.updateEntityByKey('c1', { title: 'gone' })).toBe(false);
        expect(seen).toEqual(['-', 'Ace', 'Ace of spades', '-']);
        expect(oim.db()).toBe(oim.db());
    });

    it('indexes a collection and derives from it, finding sources by reading', async () => {
        const cards = oim.entities<TCard>();
        const byDeck = oim.index(cards, { keyOf: (card) => card.deck });
        const spadeCount = oim.computed(() => byDeck.getEntityCountByKey('spades'));
        const spadeTitles: string[][] = [];
        oim.effect(() => { spadeTitles.push(byDeck.getEntitiesByKey('spades').map((card) => card.title)); });
        const counts: number[] = [];
        oim.effect(() => { counts.push(spadeCount.value); });
        cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        cards.upsertEntityByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });
        await settle();
        expect(counts).toEqual([0, 1]);
        expect(spadeTitles).toEqual([[], ['Ace']]);
        cards.updateEntityByKey('c1', { title: 'Ace of spades' });
        await settle();
        expect(spadeTitles).toEqual([[], ['Ace'], ['Ace of spades']]);
    });

    it('runs a static effect at once, wakes it only on its named sources, and runs its cleanup on stop', async () => {
        const cards = oim.entities<TCard>();
        const ace = cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        const two = cards.upsertEntityByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });
        await settle();
        const runs: string[] = [];
        const stop = oim.effect(() => {
            runs.push(`run ${ace.entity?.rank}`);
            return () => { runs.push('cleanup'); };
        }, [ace]);
        two.updateEntity({ rank: 3 });
        await settle();
        ace.updateEntity({ rank: 5 });
        await settle();
        stop();
        expect(runs).toEqual(['run 1', 'cleanup', 'run 5', 'cleanup']);
    });

    it('waits for the first change when a static effect is lazy, and keeps a once-only effect for an empty list', async () => {
        const cards = oim.entities<TCard>();
        const ace = cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        await settle();
        const runs: string[] = [];
        oim.effect(() => { runs.push(`lazy ${ace.entity?.rank}`); }, [ace], { lazy: true });
        const stopOnce = oim.effect(() => { runs.push('once'); return () => { runs.push('once gone'); }; }, []);
        ace.updateEntity({ rank: 2 });
        await settle();
        stopOnce();
        expect(runs).toEqual(['once', 'lazy 2', 'once gone']);
    });

    it('derives from named sources only when given them', async () => {
        const cards = oim.entities<TCard>();
        const ace = cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        const two = cards.upsertEntityByKey('c2', { id: 'c2', deck: 'hearts', title: 'Two', rank: 2 });
        await settle();
        let derives = 0;
        const doubled = oim.computed(() => { derives++; return (ace.entity?.rank ?? 0) * 2 + (two.entity?.rank ?? 0) * 0; }, [ace]);
        expect(doubled.value).toBe(2);
        two.updateEntity({ rank: 9 });
        await settle();
        expect(doubled.value).toBe(2);
        expect(derives).toBe(1);
        ace.updateEntity({ rank: 4 });
        await settle();
        expect(doubled.value).toBe(8);
    });

    it('keeps one entity in its own store', async () => {
        const settings = oim.entity<{ theme: string }>();
        const themes: string[] = [];
        oim.effect(() => { themes.push(settings.getEntity()?.theme ?? '-'); });
        settings.upsertEntity({ theme: 'light' });
        await settle();
        expect(settings.updateEntity({ theme: 'dark' })).toBe(true);
        await settle();
        expect(settings.deleteEntity()).toBe(true);
        await settle();
        expect(settings.updateEntity({ theme: 'gone' })).toBe(false);
        expect(themes).toEqual(['-', 'light', 'dark', '-']);
    });
    it('keeps the entities of an index key sorted, and re-sorts when a sort column changes', async () => {
        const cards = oim.entities<TCard>();
        const byDeck = oim.index(cards, { keyOf: (card) => card.deck });
        const byRank = oim.sorted(byDeck, [{ columnName: 'rank', direction: 'asc' }]);
        const orders: string[][] = [];
        oim.effect(() => { orders.push(byRank.getEntitiesByKey('spades').map((card) => card.id)); });
        cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 3 });
        cards.upsertEntityByKey('c2', { id: 'c2', deck: 'spades', title: 'Two', rank: 1 });
        cards.upsertEntityByKey('c3', { id: 'c3', deck: 'hearts', title: 'Three', rank: 2 });
        await settle();
        cards.updateEntityByKey('c1', { rank: 0 });
        await settle();
        expect(orders).toEqual([[], ['c2', 'c1'], ['c1', 'c2']]);
    });
});
