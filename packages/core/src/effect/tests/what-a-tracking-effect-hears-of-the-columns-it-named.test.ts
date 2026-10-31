import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS } from '../../slot/constants/OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS';

type TCard = { id: string; rank: number; label: string; note: string };
type TOffset = { offset: number };

const createFixture = () => {
    const db = new OIMDB();
    const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardService.createStoreSlot(db);
    const cardSlots = Array.from({ length: 8 }, (_, i) =>
        cardService.writeSlotContentByKey(cards, `r${i}`, { id: `r${i}`, rank: i, label: `l${i}`, note: '' }));
    const rendered = cardService.columnSlotService.getColumnGroup(['rank', 'label']);
    db.flush();
    const content = cardService.slotContentService;
    const write = (run: () => void): void => {
        run();
        db.flush();
    };
    return { db, cardService, cards, cardSlots, rendered, content, write };
};

const isOnFilteredPath = (slot: { slotFlags: number }): boolean => (slot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) !== 0;

describe('what a tracking effect hears of the columns it named', () => {
    it('wakes for a write to a named column and sleeps through a write to any other', () => {
        const { db, cardSlots, rendered, content, write } = createFixture();
        const card = cardSlots[0];
        let runs = 0;
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
            runs++;
        });
        write(() => content.updateEntityColumn(card, 'note', 'unseen'));
        write(() => content.updateEntity(card, { note: 'unseen again' }));
        write(() => content.markEntityChanged(card, ['note']));
        expect(runs).toBe(1);
        write(() => content.updateEntityColumn(card, 'label', 'seen'));
        write(() => content.updateEntity(card, { rank: 9 }));
        write(() => content.markEntityChanged(card, ['label']));
        write(() => content.markEntityChanged(card));
        expect(runs).toBe(5);
    });

    it('wakes for a named column written after an unnamed one in the same frame', () => {
        const { db, cardSlots, rendered, content, write } = createFixture();
        const card = cardSlots[0];
        let runs = 0;
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
            runs++;
        });
        write(() => {
            content.updateEntityColumn(card, 'note', 'first');
            content.updateEntityColumn(card, 'label', 'then');
        });
        expect(runs).toBe(2);
    });

    it('wakes for a whole value only when a named column differs, and for a clear', () => {
        const { db, cardService, cards, cardSlots, rendered, content, write } = createFixture();
        const card = cardSlots[1];
        let runs = 0;
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
            runs++;
        });
        write(() => cardService.writeSlotContentByKey(cards, 'r1', { id: 'r1', rank: 1, label: 'l1', note: 'only the note' }));
        expect(runs).toBe(1);
        write(() => cardService.writeSlotContentByKey(cards, 'r1', { id: 'r1', rank: 1, label: 'new', note: 'only the note' }));
        expect(runs).toBe(2);
        write(() => content.clearSlotContent(card));
        expect(runs).toBe(3);
    });

    it('leaves a subscriber without a filter hearing every column of the same card', () => {
        const { db, cardSlots, rendered, content, write } = createFixture();
        const card = cardSlots[2];
        let filteredRuns = 0;
        let wholeRuns = 0;
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
            filteredRuns++;
        });
        OIMEffectService.INSTANCE.createEffect(db, () => { wholeRuns++; }, [card]);
        write(() => content.updateEntityColumn(card, 'note', 'unseen'));
        expect({ filteredRuns, wholeRuns }).toEqual({ filteredRuns: 1, wholeRuns: 1 });
        write(() => content.updateEntityColumn(card, 'label', 'seen'));
        expect({ filteredRuns, wholeRuns }).toEqual({ filteredRuns: 2, wholeRuns: 2 });
    });

    it('takes a card off the filtered path once its last filtered subscriber goes', () => {
        const { db, cardSlots, rendered } = createFixture();
        const card = cardSlots[3];
        const first = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
        });
        const second = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
        });
        expect(isOnFilteredPath(card)).toBe(true);
        OIMEffectService.INSTANCE.disposeEffect(first);
        expect(isOnFilteredPath(card)).toBe(true);
        OIMEffectService.INSTANCE.disposeEffect(second);
        expect(isOnFilteredPath(card)).toBe(false);
    });

    it('moves a window of filtered cards and keeps every card it still shows on its filter', () => {
        const { db, cardSlots, rendered, content, write } = createFixture();
        const offsetService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TOffset>() });
        const offsets = offsetService.createStoreSlot(db);
        const offsetSlot = offsetService.writeSlotContentByKey(offsets, 0, { offset: 0 });
        db.flush();
        const shown: string[][] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            const offset = offsetSlot.entity?.offset ?? 0;
            const labels: string[] = [];
            for (let at = offset; at < offset + 3; at++) labels.push(cardSlots[at].readEntity(rendered)?.label ?? '');
            shown.push(labels);
        });
        write(() => offsetService.slotContentService.updateEntityColumn(offsetSlot, 'offset', 2));
        expect(shown.at(-1)).toEqual(['l2', 'l3', 'l4']);
        expect(cardSlots.map(isOnFilteredPath)).toEqual([false, false, true, true, true, false, false, false]);
        const runs = shown.length;
        write(() => content.updateEntityColumn(cardSlots[3], 'note', 'unseen'));
        write(() => content.updateEntityColumn(cardSlots[0], 'label', 'left behind'));
        expect(shown.length).toBe(runs);
        write(() => content.updateEntityColumn(cardSlots[3], 'label', 'kept'));
        expect(shown.at(-1)).toEqual(['l2', 'kept', 'l4']);
    });

    it('treats one card read through two column groups as two sources', () => {
        const { db, cardService, cardSlots, rendered, content, write } = createFixture();
        const card = cardSlots[4];
        const noteOnly = cardService.columnSlotService.getColumnGroup(['note']);
        let runs = 0;
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            void card.readEntity(rendered);
            void card.readEntity(noteOnly);
            runs++;
        });
        write(() => content.updateEntityColumn(card, 'note', 'heard'));
        write(() => content.updateEntityColumn(card, 'label', 'heard too'));
        expect(runs).toBe(3);
    });
});
