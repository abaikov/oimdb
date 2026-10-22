import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

describe('a command script written after the frame of a flush has run', () => {
    it('reaches the frame of the next flush instead of being cleared by the one that is ending', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'ace' });
        const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
        const decksService = createOIMBucketService(db, { slotContentService: membersService });
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
        OIMEffectService.INSTANCE.createEffect(db, [deck], [], () => { seenTypes = (deck.commands ?? []).map(command => command.type); });
        OIMChannelService.INSTANCE.write(db.defaultChannelSlot, deck);
        db.flush();

        expect(seenTypes).toEqual(['insert']);
    });
});
