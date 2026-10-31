import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSlotContentChangeListenerService } from '../../slot/OIMSlotContentChangeListenerService';
import { createOIMInPlaceEntityWriter } from '../createOIMInPlaceEntityWriter';
import { createOIMReplacingEntityWriter } from '../createOIMReplacingEntityWriter';
import { oimGuardedPatchEntityColumn } from '../utils/oimGuardedPatchEntityColumn';
import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { TOIMEntityWriterOptions } from '../types/TOIMEntityWriterOptions';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../../slot/createOIMSingleSlotService';

type TCard = { id: string; title: string; rank: number };

const openCards = (entityWriter: IOIMEntityWriter) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>({ entityWriter }) });
    const cards = cardsService.createStoreSlot(db);
    const slot = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', title: 'A', rank: 1 });
    db.flush();
    return { db, effectService, cardsService, cards, slot };
};

const writers: [string, (entityWriterOptions?: TOIMEntityWriterOptions) => IOIMEntityWriter][] = [
    ['in place', entityWriterOptions => createOIMInPlaceEntityWriter(entityWriterOptions)],
    ['replacing', entityWriterOptions => createOIMReplacingEntityWriter(entityWriterOptions)],
];

describe.each(writers)('what a one-column write does, %s', (label, makeWriter) => {
    it('writes the column, keeps the others, and wakes the entity once per flush', () => {
        const { db, effectService, cardsService, slot } = openCards(makeWriter());
        const before = slot.entity;
        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [slot]);
        db.flush();
        runs = 0;

        cardsService.slotContentService.updateEntityColumn(slot, 'title', 'B');
        cardsService.slotContentService.updateEntityColumn(slot, 'rank', 2);
        db.flush();

        expect(slot.entity).toEqual({ id: 'a', title: 'B', rank: 2 });
        expect(slot.entity === before).toBe(label === 'in place');
        expect(runs).toBe(1);
    });

    it('writes nothing and wakes nobody when the value is the one already held', () => {
        const { db, effectService, cardsService, slot } = openCards(makeWriter());
        const before = slot.entity;
        let runs = 0;
        effectService.createEffect(db, () => { runs++; }, [slot]);
        db.flush();
        runs = 0;

        cardsService.slotContentService.updateEntityColumn(slot, 'title', 'A');
        db.flush();

        expect(slot.entity).toBe(before);
        expect(runs).toBe(0);
    });

    it('refuses the prototype key under the guarded one-column patch', () => {
        const { cardsService, slot } = openCards(makeWriter({ patchEntityColumn: oimGuardedPatchEntityColumn }));

        cardsService.slotContentService.updateEntityColumn(slot, '__proto__' as keyof TCard & string, { polluted: true } as never);

        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.getPrototypeOf(slot.entity)).toBe(Object.prototype);
    });

    it('lets the prototype key through under the default one-column patch', () => {
        const { cardsService, slot } = openCards(makeWriter());

        cardsService.slotContentService.updateEntityColumn(slot, '__proto__' as keyof TCard & string, { polluted: true } as never);

        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect((slot.entity as unknown as Record<string, unknown>).polluted).toBe(true);
    });

    it('wakes a reader of that column and not a reader of another', () => {
        const { db, effectService, cardsService, slot } = openCards(makeWriter());
        let titleRuns = 0;
        let rankRuns = 0;
        effectService.createEffect(db, () => { titleRuns++; }, [cardsService.columnSlotService.holdColumn(slot, 'title')]);
        effectService.createEffect(db, () => { rankRuns++; }, [cardsService.columnSlotService.holdColumn(slot, 'rank')]);
        db.flush();
        titleRuns = 0;
        rankRuns = 0;

        cardsService.slotContentService.updateEntityColumn(slot, 'title', 'B');
        db.flush();

        expect({ titleRuns, rankRuns }).toEqual({ titleRuns: 1, rankRuns: 0 });
    });

    it('tells a content listener that reads the column what moved, as updateEntity does', () => {
        const { cardsService, cards, slot } = openCards(makeWriter());
        const heard: (readonly string[] | undefined)[] = [];
        OIMSlotContentChangeListenerService.INSTANCE.addContentChangeListener(cards, {
            onContentChanged: (_slot, _patch, changedColumns) => { heard.push(changedColumns); },
            onManyContentsChanged: () => undefined,
        }, ['rank']);

        cardsService.slotContentService.updateEntityColumn(slot, 'title', 'B');
        cardsService.slotContentService.updateEntityColumn(slot, 'rank', 5);

        expect(heard).toEqual([['rank']]);
        expect(slot.entity).toEqual({ id: 'a', title: 'B', rank: 5 });
    });
});

describe('what a one-column write does to a single entity', () => {
    it('writes the column and wakes a reader of it once', () => {
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const sessionService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<{ theme: string; locale: string }>() });
        const session = sessionService.createStoreSlot(db);
        sessionService.writeSingleSlotContent(session, { theme: 'dark', locale: 'en' });
        let themeRuns = 0;
        effectService.createEffect(db, () => { themeRuns++; }, [sessionService.columnSlotService.holdColumn(sessionService.getSingleSlot(session), 'theme')]);
        db.flush();
        themeRuns = 0;

        sessionService.slotContentService.updateEntityColumn(sessionService.getSingleSlot(session), 'theme', 'light');
        sessionService.slotContentService.updateEntityColumn(sessionService.getSingleSlot(session), 'locale', 'de');
        db.flush();

        expect(sessionService.getSingleSlot(session).entity).toEqual({ theme: 'light', locale: 'de' });
        expect(themeRuns).toBe(1);
    });
});
