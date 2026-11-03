import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { createOIMComputedService } from '../../computed/createOIMComputedService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { IOIMSlotSubscriptionListener } from '../interfaces/IOIMSlotSubscriptionListener';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { OIMPositionalArrayBucketContentService } from '../../bucket/OIMPositionalArrayBucketContentService';
import { OIMBucketCommands } from '../../bucket/OIMBucketCommands';

type TCard = { id: string; deck: string; title: string };

const createRecordingListener = () => {
    const told: string[] = [];
    const nameOf = (slot: TOIMSlot): string => {
        const columnSlot = slot as Partial<TOIMColumnSlot>;
        if (columnSlot.carrierSlot !== undefined) return `${String((columnSlot.carrierSlot as TOIMEntitySlot<TCard>).key)}.${String(columnSlot.key)}`;
        return String((slot as TOIMEntitySlot<TCard>).key);
    };
    const listener: IOIMSlotSubscriptionListener = {
        onSlotFirstSubscribed: slot => { told.push(`+${nameOf(slot)}`); },
        onSlotLastUnsubscribed: slot => { told.push(`-${nameOf(slot)}`); },
    };
    return { told, listener };
};

describe('who is told a slot gained its first subscriber and lost its last', () => {
    it('tells the entity collection once at the first subscriber and once at the last, not per subscription', () => {
        const db = new OIMDB();
        const { told, listener } = createRecordingListener();
        const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), slotSubscriptionListener: listener });
        const cards = cardService.createStoreSlot(db);
        const card = cardService.holdSlotByKey(cards, 'c1');

        const first = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [card]);
        const second = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [card]);
        OIMEffectService.INSTANCE.disposeEffect(first);
        expect(told).toEqual(['+c1']);

        OIMEffectService.INSTANCE.disposeEffect(second);
        expect(told).toEqual(['+c1', '-c1']);
        card.owner.unholdSlot(card);
    });

    it('does not tell anybody about a hold, a read or bucket membership without a subscriber', () => {
        const db = new OIMDB();
        const { told, listener } = createRecordingListener();
        const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), slotSubscriptionListener: listener });
        const cards = cardService.createStoreSlot(db);
        const deckService = createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TCard>>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
        const decks = deckService.createStoreSlot(db);

        const card = cardService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'd1', title: 'Ace' });
        const held = cardService.holdSlotByKey(cards, 'c1');
        cardService.getSlotByKey(cards, 'c1');
        const deck = deckService.holdSlotByKey(decks, 'd1');
        deckService.slotContentService.writeSlotContent(deck, [card]);
        db.flush();

        expect(told).toEqual([]);
        held.owner.unholdSlot(held);
        deck.owner.unholdSlot(deck);
    });

    it('hands the column slot to the listener of its entity collection when a column gets its first subscriber', () => {
        const db = new OIMDB();
        const { told, listener } = createRecordingListener();
        const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), slotSubscriptionListener: listener });
        const cards = cardService.createStoreSlot(db);
        const card = cardService.holdSlotByKey(cards, 'c1');
        const title = cardService.columnSlotService.holdColumnSlot(card, 'title');

        const effect = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [title]);
        OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(told).toEqual(['+c1.title', '-c1.title']);
        cardService.columnSlotService.unholdColumnSlot(title);
        card.owner.unholdSlot(card);
    });

    it('tells the root collection when an effect reaches the root through a derivation', () => {
        const db = new OIMDB();
        const { told, listener } = createRecordingListener();
        const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), slotSubscriptionListener: listener });
        const cards = cardService.createStoreSlot(db);
        const titleLengthService = createOIMComputedService<string, number>({});
        const titleLengths = titleLengthService.createStoreSlot(
            db,
            computedSlot => cardService.peekSlotByKey(cards, computedSlot.key)?.entity?.title.length ?? 0,
            ({ key }) => ({ sourceSlots: [cardService.getSlotByKey(cards, key)] }),
        );
        const titleLength = titleLengthService.holdSlotByKey(titleLengths, 'c1');

        const effect = OIMEffectService.INSTANCE.createEffect(db, () => undefined, [], [titleLength]);
        expect(told).toEqual(['+c1']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(told).toEqual(['+c1', '-c1']);
        titleLength.owner.unholdSlot(titleLength);
    });

    it('tells a bucket collection and an index about their buckets', () => {
        const db = new OIMDB();
        const { told: bucketTold, listener: bucketListener } = createRecordingListener();
        const { told: indexTold, listener: indexListener } = createRecordingListener();
        const cardService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardService.createStoreSlot(db);
        const deckService = createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TCard>>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }), slotSubscriptionListener: bucketListener });
        const decks = deckService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardService,
            selectKey: (card: TCard) => card.deck,
            slotSubscriptionListener: indexListener,
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const deck = deckService.holdSlotByKey(decks, 'd1');
        const indexDeck = byDeckService.holdSlotByKey(byDeck, 'd2');

        const effects = [
            OIMEffectService.INSTANCE.createEffect(db, () => undefined, [deck]),
            OIMEffectService.INSTANCE.createEffect(db, () => undefined, [indexDeck]),
        ];
        for (const effect of effects) OIMEffectService.INSTANCE.disposeEffect(effect);

        expect(bucketTold).toEqual(['+d1', '-d1']);
        expect(indexTold).toEqual(['+d2', '-d2']);
        deck.owner.unholdSlot(deck);
        indexDeck.owner.unholdSlot(indexDeck);
    });
});
