import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../OIMEffectService';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSourceTrackingComputedService } from '../../computed/createOIMSourceTrackingComputedService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; label: string };
type TOffset = { offset: number };

const ROW_COUNT = 12;
const WINDOW = 4;

const createFixture = () => {
    const db = new OIMDB();
    const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardService.createStoreSlot(db);
    const cardSlots = Array.from({ length: ROW_COUNT }, (_, i) =>
        cardService.writeSlotContentByKey(cards, `r${i}`, { id: `r${i}`, label: `l${i}` }));
    const offsetService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TOffset>() });
    const offsets = offsetService.createStoreSlot(db);
    const offsetSlot = offsetService.writeSlotContentByKey(offsets, 0, { offset: 0 });
    db.flush();
    const scrollTo = (offset: number): void => {
        offsetService.slotContentService.updateEntityColumn(offsetSlot, 'offset', offset);
        db.flush();
    };
    const writeLabel = (at: number, label: string): void => {
        cardService.slotContentService.updateEntityColumn(cardSlots[at], 'label', label);
        db.flush();
    };
    return { db, cardSlots, offsetSlot, scrollTo, writeLabel };
};

const effectCountOf = (slot: TOIMSlot): number => slot.effects?.length ?? 0;

describe('what a tracking effect keeps when its window moves', () => {
    it('keeps the cards still in the window, takes the arrivals and lets the departures go', () => {
        const { db, cardSlots, offsetSlot, scrollTo, writeLabel } = createFixture();
        const shown: string[][] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            const offset = offsetSlot.entity?.offset ?? 0;
            const labels: string[] = [];
            for (let at = offset; at < offset + WINDOW; at++) labels.push(cardSlots[at].entity?.label ?? '');
            shown.push(labels);
        });
        const keptCardSlot = cardSlots[3];
        const keptHoldCount = keptCardSlot.holdCount;

        scrollTo(2);
        expect(shown.at(-1)).toEqual(['l2', 'l3', 'l4', 'l5']);
        expect(keptCardSlot.holdCount).toBe(keptHoldCount);
        expect(effectCountOf(cardSlots[0])).toBe(0);
        expect(effectCountOf(cardSlots[1])).toBe(0);
        expect(cardSlots.slice(2, 6).map(effectCountOf)).toEqual([1, 1, 1, 1]);

        const runs = shown.length;
        writeLabel(0, 'gone');
        expect(shown.length).toBe(runs);
        writeLabel(5, 'arrived');
        expect(shown.at(-1)).toEqual(['l2', 'l3', 'l4', 'arrived']);
        writeLabel(3, 'kept');
        expect(shown.at(-1)).toEqual(['l2', 'kept', 'l4', 'arrived']);
    });

    it('finds the kept cards again when the window moves back and jumps', () => {
        const { db, cardSlots, offsetSlot, scrollTo, writeLabel } = createFixture();
        const shown: string[][] = [];
        OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            const offset = offsetSlot.entity?.offset ?? 0;
            const labels: string[] = [];
            for (let at = offset; at < offset + WINDOW; at++) labels.push(cardSlots[at].entity?.label ?? '');
            shown.push(labels);
        });
        scrollTo(6);
        scrollTo(4);
        expect(shown.at(-1)).toEqual(['l4', 'l5', 'l6', 'l7']);
        expect(cardSlots.map(effectCountOf)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
        scrollTo(8);
        expect(cardSlots.map(effectCountOf)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
        writeLabel(4, 'left behind');
        writeLabel(9, 'seen');
        expect(shown.at(-1)).toEqual(['l8', 'seen', 'l10', 'l11']);
    });

    it('holds a card read twice in one run as often as it reads it and gives every hold back', () => {
        const { db, cardSlots, offsetSlot, scrollTo } = createFixture();
        const cardSlot = cardSlots[1];
        const holdCountBefore = cardSlot.holdCount;
        const effect = OIMEffectService.INSTANCE.createSourceTrackingEffect(db, () => {
            const offset = offsetSlot.entity?.offset ?? 0;
            for (let at = offset; at < offset + WINDOW; at++) void cardSlots[at].entity;
            void cardSlots[0].entity;
            void cardSlot.entity;
        });
        scrollTo(1);
        scrollTo(3);
        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(cardSlot.holdCount).toBe(holdCountBefore);
        expect(cardSlots.map(effectCountOf)).toEqual(new Array(ROW_COUNT).fill(0));
    });

    it('moves a window that reads through a tracking computed', () => {
        const { db, cardSlots, offsetSlot, scrollTo, writeLabel } = createFixture();
        const pageService = createOIMSourceTrackingComputedService<number, readonly string[]>({
            derive: () => {
                const offset = offsetSlot.entity?.offset ?? 0;
                const labels: string[] = [];
                for (let at = offset; at < offset + WINDOW; at++) labels.push(cardSlots[at].entity?.label ?? '');
                return labels;
            },
        });
        const pages = pageService.createStoreSlot(db);
        const page = pageService.holdSlotByKey(pages, 0);
        const shown: (readonly string[])[] = [];
        OIMEffectService.INSTANCE.createAndRunEffect(db, () => {
            shown.push(readValueWithoutTracking(page));
        }, [], [], [page]);
        scrollTo(2);
        expect(shown.at(-1)).toEqual(['l2', 'l3', 'l4', 'l5']);
        writeLabel(0, 'gone');
        writeLabel(4, 'seen');
        expect(shown.at(-1)).toEqual(['l2', 'l3', 'seen', 'l5']);
        expect(page.allRootSlots).toEqual([offsetSlot, ...cardSlots.slice(2, 6)]);
    });
});
