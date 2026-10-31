import { OIMDB, OIMEffectService, OIMSlotAfterIdleReleasePolicy, oimMintAfterIdleSlotReleaseWheel } from '../../index';
import type { TOIMDisposer } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

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
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, string>(), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: WINDOW }) });
    const cards = cardsService.createStoreSlot(db);
    return {
        db, cardsService, cards,
        flushAfterIdle: (): void => {
            oimMintAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
        },
        at: (value: number): void => { ms = value; },
        fire: (): void => { const run = armed; armed = undefined; run?.(); },
        isArmed: (): boolean => armed !== undefined,
    };
};

describe('a row somebody is subscribed to', () => {
    it('costs the clock one pass, and then nothing however long the subscriber sits', () => {
        const world = watchedWorld();
        const slot = world.cardsService.writeSlotContentByKey(world.cards, 'c1', { id: 'c1', title: 'one' });
        world.db.flush();
        const effect = OIMEffectService.INSTANCE.createEffect(world.db, () => undefined, [slot]);

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
