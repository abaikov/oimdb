import {
    OIMDB, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService, createOIMEntityService, createOIMSingleEntityService,
} from '../../index';
import type { TOIMComputedSlot, TOIMEntitySlot, TOIMSingleSlotStore } from '../../index';

type TSettings = { theme: string };
type TCard = { id: string };

export function aStoreSlotFitsOnlyItsOwnStore(): void {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const settingsService = createOIMSingleEntityService<TSettings>(db);
    const cards = cardsService.createStoreSlot(db);
    const settings = settingsService.createStoreSlot(db);

    settingsService.getSingleSlot(settings);
    cardsService.getSlotByKey(cards, 'c1');
    // @ts-expect-error a single reads `store.slot`, which a map does not have
    settingsService.getSingleSlot(cards);
    // @ts-expect-error a keyed service reads a map, which a single's store is not
    cardsService.getSlotByKey(settings, 'c1');

    // @ts-expect-error a keyed factory takes no void key; a single has its own factory
    createOIMEntityService<TSettings, keyof TSettings, void>(db, {});
    // @ts-expect-error the same for a computed
    createOIMComputedService<void, number>({ derive: () => 1, createSources: () => ({}) });
    createOIMComputedService<void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
    });
    // @ts-expect-error a store named other than the map default must bring its service
    createOIMEntityService<TCard, keyof TCard, string, TOIMSingleSlotStore<TOIMEntitySlot<TCard, string>>>(db, { keyOf: card => card.id });
}
