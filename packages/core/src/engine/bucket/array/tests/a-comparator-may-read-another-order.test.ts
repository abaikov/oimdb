import { OIMDB } from '../../../../factories/OIMDB';
import { createOIMEntityService } from '../../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../../factories/createOIMIndexService';
import { createOIMComputedServiceSorted } from '../../../../factories/createOIMComputedServiceSorted';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';

type TCard = { id: string; group: string; rank: number };

const idsOf = (slots: readonly TOIMEntitySlot<TCard>[]): string[] => slots.map(slot => slot.entity?.id ?? '?');

describe('a comparator that reads a different index order', () => {
    it('orders both, and refuses neither', () => {
        const db = new OIMDB();
        const othersService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const others = othersService.createStoreSlot(db);
        const otherByGroupService = createOIMIndexService(db, {
            entityService: othersService,
            keyOf: (card: TCard) => card.group,
        });
        const otherByGroup = otherByGroupService.createIndexStoreSlot(others);
        const otherByGroupOrdersService = createOIMComputedServiceSorted({
            indexService: otherByGroupService,
            sortColumns: [{ column: 'rank', direction: 'asc' }],
        });
        const otherByGroupOrders = otherByGroupOrdersService.createSortedStoreSlot(otherByGroup);
        const otherOrder = otherByGroupOrdersService.computedCollectionService.holdSlotByKey(otherByGroupOrders, 'other');
        const getOtherOrderValue = () =>
            otherByGroupOrdersService.computedCollectionService.slotContentService.getValueForSlot(otherOrder);

        const during = { armed: false, read: [] as string[] };
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byGroupService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.group,
        });
        const byGroup = byGroupService.createIndexStoreSlot(cards);
        const byGroupOrdersService = createOIMComputedServiceSorted({
            indexService: byGroupService,
            comparator: (left: TCard, right: TCard) => {
                if (during.armed) {
                    during.armed = false;
                    during.read = idsOf(getOtherOrderValue());
                }
                return left.rank - right.rank;
            },
        });
        const byGroupOrders = byGroupOrdersService.createSortedStoreSlot(byGroup);
        const order = byGroupOrdersService.computedCollectionService.holdSlotByKey(byGroupOrders, 'group');
        const getOrderValue = () => byGroupOrdersService.computedCollectionService.slotContentService.getValueForSlot(order);

        othersService.slotContentService.upsertEntities(others, [
            { id: 'x', group: 'other', rank: 3 },
            { id: 'y', group: 'other', rank: 1 },
            { id: 'z', group: 'other', rank: 2 },
        ]);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'a', group: 'group', rank: 3 },
            { id: 'b', group: 'group', rank: 1 },
            { id: 'c', group: 'group', rank: 2 },
        ]);

        during.armed = true;
        expect(idsOf(getOrderValue())).toEqual(['b', 'c', 'a']);
        expect(during.read).toEqual(['y', 'z', 'x']);

        cardsService.slotContentService.upsertEntity(cards, { id: 'd', group: 'group', rank: 0 });
        expect(idsOf(getOrderValue())).toEqual(['d', 'b', 'c', 'a']);
        expect(idsOf(getOtherOrderValue())).toEqual(['y', 'z', 'x']);
    });
});
