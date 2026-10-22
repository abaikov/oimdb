import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = (withCommands: boolean) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const bucketCommands = withCommands ? new OIMBucketCommands({}) : undefined;
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>({ bucketCommands });
    const decksService = createOIMBucketService(db, { slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    return { cardsService, cards, membersService, decksService, decks, bucketCommands };
};

describe('what a recorder nobody reads any more leaves', () => {
    it('a bucket built without commands writes none onto its slot', () => {
        const fixture = createFixture(false);
        const spades = fixture.decksService.holdSlotByKey(fixture.decks, 'spades');
        fixture.membersService.insertBucketMemberSlotAt(
            spades, 0, fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'ace' }),
        );
        expect(spades.commands).toBeUndefined();
        expect(spades.isWholeListRecorded).toBe(false);
    });

    it('records into the one recorder it was built with', () => {
        const fixture = createFixture(true);
        expect(Reflect.get(fixture.membersService, 'bucketCommands')).toBe(fixture.bucketCommands);
    });
});
