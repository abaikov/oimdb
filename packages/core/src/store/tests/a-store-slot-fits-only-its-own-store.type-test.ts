import { OIMDB, createOIMComputedService, createOIMSlotCollectionService, createOIMSingleSlotService, createOIMEntityContentService } from '../../index';

type TSettings = { theme: string };
type TCard = { id: string };

export function aStoreSlotFitsOnlyItsOwnStore(): void {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const settingsService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TSettings>() });
    const cards = cardsService.createStoreSlot(db);
    const settings = settingsService.createStoreSlot(db);

    settingsService.getSingleSlot(settings);
    cardsService.getSlotByKey(cards, 'c1');
    // @ts-expect-error a single reads `store.slot`, which a map does not have
    settingsService.getSingleSlot(cards);
    // @ts-expect-error a keyed service reads a map, which a single's store is not
    cardsService.getSlotByKey(settings, 'c1');

    // @ts-expect-error a keyed computed takes no void key; a single computed has its own factory
    createOIMComputedService<void, number>({ derive: () => 1, createSources: () => ({}) });
}
