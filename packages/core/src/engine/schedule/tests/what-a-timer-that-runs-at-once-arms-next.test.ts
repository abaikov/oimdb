import type { TOIMTimer } from '../types/TOIMTimer';
import type { TOIMFlushSchedulerSlot } from '../types/TOIMFlushSchedulerSlot';
import { OIMFlushSchedulerService } from '../OIMFlushSchedulerService';
import { OIM_NOTHING_TO_DISPOSE } from '../constants/OIM_NOTHING_TO_DISPOSE';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';
import type { IOIMFlushSchedulerListener } from '../interfaces/IOIMFlushSchedulerListener';

const runAtOnce: TOIMTimer = (run) => {
    run();
    return OIM_NOTHING_TO_DISPOSE;
};

class CountingFlushSchedulerService implements IOIMFlushSchedulerListener<TOIMFlushSchedulerSlot> {
    public flushes = 0;

    public onSchedulerTimerFired(): void {
        this.flushes++;
    }

    public scheduleAtOnce(flushSchedulerSlot: TOIMFlushSchedulerSlot): void {
        OIMFlushSchedulerService.INSTANCE.schedule(flushSchedulerSlot, 0, this);
    }
}

describe('a timer that runs its callback before it returns', () => {
    it('leaves the scheduler free to arm the next flush', () => {
        const flushSchedulerService = new CountingFlushSchedulerService();
        const flushSchedulerSlot: TOIMFlushSchedulerSlot = { timer: runAtOnce, scheduledCallback: undefined, timerDisposer: undefined };

        flushSchedulerService.scheduleAtOnce(flushSchedulerSlot);
        flushSchedulerService.scheduleAtOnce(flushSchedulerSlot);
        flushSchedulerService.scheduleAtOnce(flushSchedulerSlot);

        expect(flushSchedulerService.flushes).toBe(3);
    });

    it('delivers every write through a channel scheduler that flushes at once', () => {
        type TCard = { id: string; title: string };
        const db = new OIMDB({ channelScheduler: (run) => { run(); } });
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [cardsService.getSlotByKey(cards, 'c1')], [], () => { runs++; });

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'a' });
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'b' });
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'c' });

        expect(runs).toBe(3);
    });
});
