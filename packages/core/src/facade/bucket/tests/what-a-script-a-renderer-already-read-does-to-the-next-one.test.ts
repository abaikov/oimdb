import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMOrderedListCommand } from '../../../engine/bucket/commands/types/TOIMOrderedListCommand';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const replay = (rendered: TOIMSlot[], commands: readonly TOIMOrderedListCommand[]): void => {
    for (const command of commands) {
        if (command.type === 'insert') rendered.splice(command.index, 0, command.slot);
        else if (command.type === 'remove') rendered.splice(command.index, 1);
        else if (command.type === 'move') rendered.splice(command.to, 0, ...rendered.splice(command.from, 1));
        else rendered.splice(0, rendered.length, ...command.slots);
    }
};

describe('a script a renderer already read', () => {
    it('is not replayed when a write lands after the flush ahead of the recorder\'s own reset', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const ace = cardsService.slotContentService.upsertEntity(cards, { id: 'ace', title: 'ace' });
        const two = cardsService.slotContentService.upsertEntity(cards, { id: 'two', title: 'two' });
        let insertTwoOnce: (() => void) | undefined;
        OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => {
            const insertTwo = insertTwoOnce;
            insertTwoOnce = undefined;
            insertTwo?.();
        });
        const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
        const decksService = createOIMBucketService(db, { slotContentService: membersService });
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd1');
        db.flush();
        const rendered: TOIMSlot[] = [];
        OIMEffectService.INSTANCE.createEffect(db, [deck], [], () => { replay(rendered, deck.commands ?? []); });

        membersService.addBucketMemberSlots(deck, [ace]);
        insertTwoOnce = () => { membersService.insertBucketMemberSlotAt(deck, 0, two); };
        const keysOf = (slots: Iterable<TOIMSlot>): unknown[] => Array.from(slots, slot => (slot as TCardSlot).key);
        db.flush();
        expect(keysOf(rendered)).toEqual(['ace']);

        db.flush();
        expect(keysOf(rendered)).toEqual(keysOf(membersService.getBucketMemberSlots(deck)));
        expect(keysOf(rendered)).toEqual(['two', 'ace']);
    });
});
