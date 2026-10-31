import { OIMDB } from '@oimdb/core';
import * as oimdb from '../oimdb';

type TCard = { id: string; deck: string; title: string; rank: number };

describe('what the oimdb layer gives a library', () => {
    it('keeps two dbs apart: each collection, index and effect lives on the db it was given', () => {
        const left = new OIMDB();
        const right = new OIMDB();
        const leftCards = oimdb.entities<TCard>(left);
        const rightCards = oimdb.entities<TCard>(right);
        const leftByDeck = oimdb.index(leftCards, { keyOf: (card) => card.deck });
        const seen: string[] = [];
        oimdb.effect(left, () => { seen.push(`left ${leftByDeck.getEntitiesByKey('spades').map((card) => card.title).join(',')}`); });
        oimdb.effect(right, () => { seen.push(`right ${rightCards.getEntityByKey('c1')?.title ?? '-'}`); });
        leftCards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        right.flush();
        left.flush();
        rightCards.upsertEntityByKey('c1', { id: 'c1', deck: 'hearts', title: 'Two', rank: 2 });
        left.flush();
        right.flush();
        expect(seen).toEqual(['left ', 'right -', 'left Ace', 'right Two']);
    });

    it('derives and runs static effects on the db it was given', () => {
        const db = new OIMDB();
        const cards = oimdb.entities<TCard>(db);
        const ace = cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.flush();
        const doubled = oimdb.computed(db, () => (ace.entity?.rank ?? 0) * 2, [ace]);
        const runs: number[] = [];
        const stop = oimdb.effect(db, () => { runs.push(doubled.value); }, [ace], { lazy: true });
        ace.updateEntity({ rank: 5 });
        db.flush();
        stop();
        ace.updateEntity({ rank: 6 });
        db.flush();
        expect(runs).toEqual([10]);
        const settings = oimdb.entity<{ theme: string }>(db);
        settings.upsertEntity({ theme: 'dark' });
        expect(settings.getEntity()).toEqual({ theme: 'dark' });
    });
});
