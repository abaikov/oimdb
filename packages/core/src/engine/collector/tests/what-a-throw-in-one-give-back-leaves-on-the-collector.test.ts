import { OIMUnusedSlotCollectorService } from '../OIMUnusedSlotCollectorService';
import { createOIMUnusedSlotCollectorSlot } from '../utils/createOIMUnusedSlotCollectorSlot';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;

const createFixture =(refuses: string) => {
    const gaveBack: string[] = [];
    const owner: IOIMSlotOwner = {
        holdSlot: () => undefined,
        unholdSlot: (slot: TOIMSlot): void => {
            const key = (slot as TCardSlot).key;
            if (key === refuses) throw new Error(`the give-back of ${key} threw`);
            gaveBack.push(key);
        },
        releaseSlotIfUnheld: () => undefined,
        subscribeToSlot: () => 0,
        unsubscribeFromSlot: () => false,
    };
    const unusedSlotCollectorSlot = createOIMUnusedSlotCollectorSlot();
    const flushUnusedSlotCollector = (): void => { OIMUnusedSlotCollectorService.INSTANCE.flush(unusedSlotCollectorSlot); };
    const tracked = ['first', 'second', 'third'].map(key => {
        const slot = createOIMEntitySlot<TCard, string>(key, owner);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(unusedSlotCollectorSlot, slot);
        return slot;
    });
    return { gaveBack, flushUnusedSlotCollector, tracked };
};

describe('a give-back that throws, in the middle of a flush of tracked identities', () => {
    it('leaves the ones after it tracked, and the next flush gives them back', () => {
        const { gaveBack, flushUnusedSlotCollector } = createFixture('second');

        expect(() => { flushUnusedSlotCollector(); }).toThrow('the give-back of second threw');
        expect(gaveBack).toEqual(['first']);

        flushUnusedSlotCollector();

        expect(gaveBack).toEqual(['first', 'third']);
    });

    it('takes the ones it gave back off the list, so no second flush gives them back twice', () => {
        const { gaveBack, flushUnusedSlotCollector } = createFixture('second');

        expect(() => { flushUnusedSlotCollector(); }).toThrow();
        flushUnusedSlotCollector();
        flushUnusedSlotCollector();

        expect(gaveBack).toEqual(['first', 'third']);
    });

    it('still empties the list when nothing throws at all', () => {
        const { gaveBack, flushUnusedSlotCollector } = createFixture('nobody');

        flushUnusedSlotCollector();
        flushUnusedSlotCollector();

        expect(gaveBack).toEqual(['first', 'second', 'third']);
    });
});
