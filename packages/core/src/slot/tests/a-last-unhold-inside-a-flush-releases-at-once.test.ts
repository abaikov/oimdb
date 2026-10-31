import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMComputedService } from '../../computed/createOIMComputedService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };

function releaseInsideAFlush(db: OIMDB, slot: TOIMSlot): { isReleasedInsideTheFlush: boolean | undefined } {
    const effectService = OIMEffectService.INSTANCE;
    const watching = effectService.createEffect(db, () => undefined, [slot]);
    slot.owner.unholdSlot(slot);
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const trigger = cardsService.holdSlotByKey(cards, 'trigger');
    const answer: { isReleasedInsideTheFlush: boolean | undefined } = { isReleasedInsideTheFlush: undefined };
    effectService.createEffect(db, () => {
        effectService.disposeEffect(watching);
        answer.isReleasedInsideTheFlush = oimIsSlotReleased(slot);
    }, [trigger]);
    cardsService.writeSlotContentByKey(cards, 'trigger', { id: 'trigger', title: 'go' });
    db.flush();
    return answer;
}

describe('a last unhold inside a flush', () => {
    it('releases a computed slot at once', () => {
        const db = new OIMDB();
        const queriesService = createOIMComputedService<string, number>({ derive: slot => slot.key.length, createSources: () => ({}), initialValue: 0 });
        const queries = queriesService.createComputedStoreSlot(db);
        const query = queriesService.computedCollectionService.holdSlotByKey(queries, 'q');

        expect(releaseInsideAFlush(db, query).isReleasedInsideTheFlush).toBe(true);
        expect(queriesService.computedCollectionService.findSlotByKey(queries, 'q')).toBeUndefined();
    });

    it('releases an entity slot with a value at once, under a policy that releases it at its last unhold', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({
            slotContentService: createOIMSlotContentEntityService<TCard>(), slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE,
        });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.holdSlotByKey(cards, 'ace');
        cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', title: 'Ace' });

        expect(releaseInsideAFlush(db, ace).isReleasedInsideTheFlush).toBe(true);
        expect(cardsService.findSlotByKey(cards, 'ace')).toBeUndefined();
    });

    it('releases a bucket slot with members at once, under a policy that releases it at its last unhold, and gives its members back', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', title: 'Ace' });
        const handsService = createOIMSlotCollectionService({
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(), slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE,
        });
        const hands = handsService.createStoreSlot(db);
        const hand = handsService.holdSlotByKey(hands, 'hand');
        handsService.slotContentService.writeSlotContent(hand, [ace]);

        expect(releaseInsideAFlush(db, hand).isReleasedInsideTheFlush).toBe(true);
        expect(handsService.findSlotByKey(hands, 'hand')).toBeUndefined();
        expect(ace.holdCount).toBe(0);
    });
});
