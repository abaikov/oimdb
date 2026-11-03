import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMComputedService } from '../../computed/createOIMComputedService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';
import { isOIMSlotReleased } from '../utils/isOIMSlotReleased';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };

function releaseInsideAFlush(db: OIMDB, slot: TOIMSlot): { isReleasedInsideTheFlush: boolean | undefined } {
    const effectService = OIMEffectService.INSTANCE;
    const watching = effectService.createEffect(db, () => undefined, [slot]);
    slot.owner.unholdSlot(slot);
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const trigger = cardsService.holdSlotByKey(cards, 'trigger');
    const answer: { isReleasedInsideTheFlush: boolean | undefined } = { isReleasedInsideTheFlush: undefined };
    effectService.createEffect(db, () => {
        effectService.disposeEffect(watching);
        answer.isReleasedInsideTheFlush = isOIMSlotReleased(slot);
    }, [trigger]);
    cardsService.writeSlotContentByKey(cards, 'trigger', { id: 'trigger', title: 'go' });
    db.flush();
    return answer;
}

describe('a last unhold inside a flush', () => {
    it('releases a computed slot at once', () => {
        const db = new OIMDB();
        const queriesService = createOIMComputedService<string, number>({ derive: slot => slot.key.length, createSources: () => ({}), initialValue: 0 });
        const queries = queriesService.createStoreSlot(db);
        const query = queriesService.holdSlotByKey(queries, 'q');

        expect(releaseInsideAFlush(db, query).isReleasedInsideTheFlush).toBe(true);
        expect(queriesService.peekSlotByKey(queries, 'q')).toBeUndefined();
    });

    it('releases an entity slot with a value at once, under a policy that releases it at its last unhold', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({
            slotContentService: createOIMEntityContentService<TCard>(), slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE,
        });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.holdSlotByKey(cards, 'ace');
        cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', title: 'Ace' });

        expect(releaseInsideAFlush(db, ace).isReleasedInsideTheFlush).toBe(true);
        expect(cardsService.peekSlotByKey(cards, 'ace')).toBeUndefined();
    });

    it('releases a bucket slot with members at once, under a policy that releases it at its last unhold, and gives its members back', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', title: 'Ace' });
        const handsService = createOIMSlotCollectionService({
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>(), slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE,
        });
        const hands = handsService.createStoreSlot(db);
        const hand = handsService.holdSlotByKey(hands, 'hand');
        handsService.slotContentService.writeSlotContent(hand, [ace]);

        expect(releaseInsideAFlush(db, hand).isReleasedInsideTheFlush).toBe(true);
        expect(handsService.peekSlotByKey(hands, 'hand')).toBeUndefined();
        expect(ace.holdCount).toBe(0);
    });
});
