import { OIMDB } from '@oimdb/core';
import * as soimdb from '../soimdb';

type TCard = { id: string; deck: string; title: string; rank: number };

describe('what the soimdb layer gives a library', () => {
    it('keeps two dbs apart: each collection, index and effect lives on the db it was given', () => {
        const left = new OIMDB();
        const right = new OIMDB();
        const leftCards = soimdb.entities<TCard>(left);
        const rightCards = soimdb.entities<TCard>(right);
        const leftByDeck = soimdb.index(leftCards, { keyOf: (card) => card.deck });
        const seen: string[] = [];
        soimdb.effect(left, () => { seen.push(`left ${leftByDeck.getEntitiesByKey('spades').map((card) => card.title).join(',')}`); });
        soimdb.effect(right, () => { seen.push(`right ${rightCards.getEntityByKey('c1')?.title ?? '-'}`); });
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
        const cards = soimdb.entities<TCard>(db);
        const ace = cards.upsertEntityByKey('c1', { id: 'c1', deck: 'spades', title: 'Ace', rank: 1 });
        db.flush();
        const doubled = soimdb.computed(db, () => (ace.entity?.rank ?? 0) * 2, [ace]);
        const runs: number[] = [];
        const stop = soimdb.effect(db, () => { runs.push(doubled.value); }, [ace], { lazy: true });
        ace.updateEntity({ rank: 5 });
        db.flush();
        stop();
        ace.updateEntity({ rank: 6 });
        db.flush();
        expect(runs).toEqual([10]);
        const settings = soimdb.entity<{ theme: string }>(db);
        settings.upsertEntity({ theme: 'dark' });
        expect(settings.getEntity()).toEqual({ theme: 'dark' });
    });
});
