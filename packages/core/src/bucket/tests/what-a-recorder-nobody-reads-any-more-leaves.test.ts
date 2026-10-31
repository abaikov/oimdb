import { OIMSlotContentPositionalArrayBucketService } from '../OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../db/OIMDB';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = (withCommands: boolean) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const bucketCommands = withCommands ? new OIMBucketCommands({}) : undefined;
    const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands });
    const decksService = createOIMSlotCollectionService({ slotContentService: membersService });
    const decks = decksService.createStoreSlot(db);
    return { cardsService, cards, membersService, decksService, decks, bucketCommands };
};

describe('what a recorder nobody reads any more leaves', () => {
    it('a bucket built without commands writes none onto its slot', () => {
        const fixture = createFixture(false);
        const spades = fixture.decksService.holdSlotByKey(fixture.decks, 'spades');
        fixture.membersService.insertBucketMemberSlotAt(
            spades, 0, fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'ace' }),
        );
        expect(spades.commands).toBeUndefined();
        expect(spades.isWholeListRecorded).toBe(false);
    });

    it('records into the one recorder it was built with', () => {
        const fixture = createFixture(true);
        expect(Reflect.get(fixture.membersService, 'bucketCommands')).toBe(fixture.bucketCommands);
    });
});
