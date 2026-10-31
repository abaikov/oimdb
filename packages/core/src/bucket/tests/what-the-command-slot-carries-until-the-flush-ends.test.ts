import { OIMPositionalArrayBucketContentService } from '../OIMPositionalArrayBucketContentService';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMPositionalArrayBucketContentService<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
    const decksService = createOIMSlotCollectionService({ slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    const spades = decksService.holdSlotByKey(decks, 'spades');
    const slotOf = (id: string, title: string): TOIMEntitySlot<TCard, TOIMStoreKey> => {
        const slot = cardsService.writeSlotContentByKey(cards, id, { id, title });
        return slot;
    };
    return { db, membersService, spades, slotOf };
};

describe('what the command slot carries until the flush ends', () => {
    it('records one insert per arriving entity slot, at the position it landed', () => {
        const fixture = createFixture();
        let script: unknown[] = [];
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(fixture.db.defaultChannelSlot, () => {
            script = (fixture.spades.commands ?? []).slice();
        });

        const ace = fixture.slotOf('c1', 'ace');
        const two = fixture.slotOf('c2', 'two');
        fixture.membersService.addBucketMemberSlots(fixture.spades, [ace, two]);
        fixture.db.flush();

        expect(script).toEqual([
            { type: 'insert', index: 0, slot: ace },
            { type: 'insert', index: 1, slot: two },
        ]);
    });

    it('drops what it carried once the flush has ended', () => {
        const fixture = createFixture();
        let lengthInsideTheFlush = -1;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(fixture.db.defaultChannelSlot, () => {
            lengthInsideTheFlush = (fixture.spades.commands ?? []).length;
        });

        fixture.membersService.addBucketMemberSlots(fixture.spades, [fixture.slotOf('c1', 'ace')]);
        fixture.db.flush();

        expect(lengthInsideTheFlush).toBe(1);
        expect((fixture.spades.commands ?? []).length).toBe(0);
        expect(fixture.spades.isWholeListRecorded).toBe(false);
    });

    it('records a removal at the position the entity slot sat in', () => {
        const fixture = createFixture();
        const ace = fixture.slotOf('c1', 'ace');
        const two = fixture.slotOf('c2', 'two');
        fixture.membersService.addBucketMemberSlots(fixture.spades, [ace, two]);
        fixture.db.flush();
        let script: unknown[] = [];
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(fixture.db.defaultChannelSlot, () => { script = (fixture.spades.commands ?? []).slice(); });

        fixture.membersService.removeBucketMemberSlots(fixture.spades, [two]);
        fixture.db.flush();

        expect(script).toEqual([{ type: 'remove', index: 1 }]);
    });

    it('asks for the whole list when the bucket was written as a whole', () => {
        const fixture = createFixture();
        let wholeListWasAsked = false;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(fixture.db.defaultChannelSlot, () => {
            wholeListWasAsked = fixture.spades.isWholeListRecorded;
        });

        fixture.membersService.writeSlotContent(fixture.spades, [fixture.slotOf('c1', 'ace'), fixture.slotOf('c2', 'two')]);
        fixture.db.flush();

        expect(wholeListWasAsked).toBe(true);
    });
});
