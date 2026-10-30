import { OIMSlotContentPositionalArrayBucketService } from '../OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

describe('a command script written after the frame of a flush has run', () => {
    it('reaches the frame of the next flush instead of being cleared by the one that is ending', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'ace' });
        const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
        const decksService = createOIMSlotCollectionService(db, { slotContentService: membersService });
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        let writeOnce = true;
        OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => {
            if (!writeOnce) return;
            writeOnce = false;
            membersService.addBucketMemberSlots(deck, [ace]);
        });
        db.flush();

        let seenTypes: string[] = [];
        OIMEffectService.INSTANCE.createEffect(db, () => { seenTypes = (deck.commands ?? []).map(command => command.type); }, [deck]);
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, deck);
        db.flush();

        expect(seenTypes).toEqual(['insert']);
    });
});
