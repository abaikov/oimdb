import { OIMSlotContentBucketServiceSetDriven } from '../OIMSlotContentBucketServiceSetDriven';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotOwner } from '../../../engine/slot/OIMSlotOwner';
import { createOIMEntitySlot } from '../../../engine/entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import type { TOIMStoreSlot } from '../../../engine/slot/types/TOIMStoreSlot';
import type { OIMChannelQueue } from '../../../engine/channel/OIMChannelQueue';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;

class RowOwnerThatCanWriteWhileGivingBack extends OIMSlotOwner {
    public readonly givenBack: string[] = [];

    public writeOnNextGiveBack: (() => void) | undefined = undefined;

    public override unholdSlot(slot: TOIMSlot): void {
        super.unholdSlot(slot);
        this.givenBack.push((slot as TCardSlot).key);
        const writeOnNextGiveBack = this.writeOnNextGiveBack;
        if (writeOnNextGiveBack === undefined) return;
        this.writeOnNextGiveBack = undefined;
        writeOnNextGiveBack();
    }
}

const scratchLengths = (byDeck: TOIMStoreSlot): number[] => {
    const inside = byDeck as unknown as {
        arrivedBucketMemberSlotChannelQueues?: readonly OIMChannelQueue<unknown>[];
        departedBucketMemberSlotChannelQueues?: readonly OIMChannelQueue<unknown>[];
    };
    return [...(inside.arrivedBucketMemberSlotChannelQueues ?? []), ...(inside.departedBucketMemberSlotChannelQueues ?? [])]
        .map(channelQueue => channelQueue.getEntryCount());
};

const createFixture =(rows: number) => {
    const db = new OIMDB();
    const rowOwner = new RowOwnerThatCanWriteWhileGivingBack();
    const byDeckService = createOIMBucketService(db, {
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    });
    const byDeck = byDeckService.createStoreSlot(db);
    const rowsOf = (deckId: string): TCardSlot[] => Array.from(
        { length: rows }, (_unused, at) => createOIMEntitySlot<TCard, string>(`${deckId}r${at}`, rowOwner),
    );
    return { db, byDeckService, byDeck, rowOwner, rowsOf };
};

describe('what a write gives back when a give back writes again', () => {
    it('gives every departing slot back even though the cascade wrote the same collection', () => {
        const { byDeckService, byDeck, rowOwner, rowsOf } = createFixture(5);
        const deckA = byDeckService.holdSlotByKey(byDeck, 'a');
        const deckB = byDeckService.holdSlotByKey(byDeck, 'b');
        const rowsOfA = rowsOf('a');
        const rowsOfB = rowsOf('b');
        byDeckService.slotContentService.writeBucketMemberSlots(deckA, rowsOfA);
        rowOwner.givenBack.length = 0;

        let scratchDuringTheCascade: number[] = [];
        rowOwner.writeOnNextGiveBack = () => {
            byDeckService.slotContentService.writeBucketMemberSlots(deckB, rowsOfB);
            scratchDuringTheCascade = scratchLengths(byDeck);
        };
        byDeckService.slotContentService.writeBucketMemberSlots(deckA, []);

        expect(rowOwner.givenBack).toEqual(rowsOfA.map(row => row.key));
        expect(rowsOfA.map(row => row.holdCount)).toEqual([0, 0, 0, 0, 0]);
        expect(rowsOfB.map(row => row.holdCount)).toEqual([1, 1, 1, 1, 1]);
        expect(Math.max(...scratchDuringTheCascade)).toBe(rowsOfA.length);
    });

    it('keeps no departing slot once the write that released them has returned', () => {
        const { byDeckService, byDeck, rowOwner, rowsOf } = createFixture(5);
        const deckA = byDeckService.holdSlotByKey(byDeck, 'a');
        const rowsOfA = rowsOf('a');

        byDeckService.slotContentService.writeBucketMemberSlots(deckA, rowsOfA);
        byDeckService.slotContentService.writeBucketMemberSlots(deckA, []);

        expect(rowOwner.givenBack.length).toBe(rowsOfA.length);
        expect(scratchLengths(byDeck).every(length => length === 0)).toBe(true);
    });

    it('keeps no arriving slot either, and clears what a cleared bucket left', () => {
        const { byDeckService, byDeck, rowsOf } = createFixture(3);
        const deckA = byDeckService.holdSlotByKey(byDeck, 'a');

        byDeckService.slotContentService.writeBucketMemberSlots(deckA, rowsOf('a'));

        expect(scratchLengths(byDeck).every(length => length === 0)).toBe(true);

        byDeckService.slotContentService.clearBucketMemberSlots(deckA);

        expect(scratchLengths(byDeck).every(length => length === 0)).toBe(true);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deckA)).toBe(0);
    });
});
