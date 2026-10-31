import { OIMDB } from '../../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../../index/createOIMSlotCollectionIndexService';
import { createOIMSortedComputedService } from '../../../computed/createOIMSortedComputedService';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../slot/createOIMSlotCollectionService';

type TCard = { id: string; group: string; rank: number };

const idsOf = (slots: readonly TOIMEntitySlot<TCard>[]): string[] => slots.map(slot => slot.entity?.id ?? '?');

describe('a comparator that reads a different index order', () => {
    it('orders both, and refuses neither', () => {
        const db = new OIMDB();
        const othersService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const others = othersService.createStoreSlot(db);
        const otherByGroupService = createOIMSlotCollectionIndexService({
            entityService: othersService,
            keyOf: (card: TCard) => card.group,
        });
        const otherByGroup = otherByGroupService.createIndexStoreSlot(others);
        const otherByGroupOrdersService = createOIMSortedComputedService({
            indexService: otherByGroupService,
            sortColumns: [{ columnName: 'rank', direction: 'asc' }],
        });
        const otherByGroupOrders = otherByGroupOrdersService.createSortedStoreSlot(otherByGroup);
        const otherOrder = otherByGroupOrdersService.computedCollectionService.holdSlotByKey(otherByGroupOrders, 'other');
        const getOtherOrderValue = () =>
            otherOrder.computedValueService.getValueForSlot(otherOrder);

        const during = { armed: false, read: [] as string[] };
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byGroupService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            keyOf: (card: TCard) => card.group,
        });
        const byGroup = byGroupService.createIndexStoreSlot(cards);
        const byGroupOrdersService = createOIMSortedComputedService({
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
        const getOrderValue = () => order.computedValueService.getValueForSlot(order);

        othersService.writeInBatch(others, () => ([
            { id: 'x', group: 'other', rank: 3 },
            { id: 'y', group: 'other', rank: 1 },
            { id: 'z', group: 'other', rank: 2 },
        ]).map(entity => othersService.writeSlotContentByKey(others, entity.id, entity)));
        cardsService.writeInBatch(cards, () => ([
            { id: 'a', group: 'group', rank: 3 },
            { id: 'b', group: 'group', rank: 1 },
            { id: 'c', group: 'group', rank: 2 },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        during.armed = true;
        expect(idsOf(getOrderValue())).toEqual(['b', 'c', 'a']);
        expect(during.read).toEqual(['y', 'z', 'x']);

        cardsService.writeSlotContentByKey(cards, 'd', { id: 'd', group: 'group', rank: 0 });
        expect(idsOf(getOrderValue())).toEqual(['d', 'b', 'c', 'a']);
        expect(idsOf(getOtherOrderValue())).toEqual(['y', 'z', 'x']);
    });
});
