import {
    OIMDB,
    OIMEffectService,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMSlotReleasePolicyAfterIdle,
    createOIMEntityService,
} from '../../../index';
import type { TOIMDisposer } from '../../../index';

type TCard = { id: string; title: string };

const START = 1_000_000;
const WINDOW = 30_000;

const watchedWorld = () => {
    let ms = START;
    let armed: (() => void) | undefined;
    const db = new OIMDB({
        getNowMs: () => ms,
        releaseTimer: (run): TOIMDisposer => { armed = run; return () => { armed = undefined; }; },
    });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: WINDOW }),
    });
    const cards = cardsService.createStoreSlot(db);
    return {
        db, cardsService, cards,
        flushAfterIdle: (): void => {
            OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
        },
        at: (value: number): void => { ms = value; },
        fire: (): void => { const run = armed; armed = undefined; run?.(); },
        isArmed: (): boolean => armed !== undefined,
    };
};

describe('a row somebody is subscribed to', () => {
    it('costs the clock one pass, and then nothing however long the subscriber sits', () => {
        const world = watchedWorld();
        const slot = world.cardsService.slotContentService.upsertEntity(world.cards, { id: 'c1', title: 'one' });
        world.db.flush();
        const effect = OIMEffectService.INSTANCE.createEffect(world.db, [slot], [], () => undefined);

        world.at(START + WINDOW + 1_000);
        world.flushAfterIdle();
        expect(world.isArmed()).toBe(false);
        expect(world.cardsService.getSlotByKey(world.cards, 'c1')).toBe(slot);

        world.at(START + WINDOW * 100);
        world.flushAfterIdle();
        expect(world.isArmed()).toBe(false);
        expect(world.cardsService.getSlotByKey(world.cards, 'c1')).toBe(slot);

        OIMEffectService.INSTANCE.disposeEffect(effect);
    });
});
