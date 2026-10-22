import { OIMDefaults } from '../OIMDefaults';
import { OIMSlotStoreServiceMapDriven } from '../../engine/store/OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMSingleSlotStore } from '../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMComputedSlot } from '../../engine/computed/types/TOIMComputedSlot';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import { OIMKeyTreeWalkScalar } from '../../engine/key/OIMKeyTreeWalkScalar';
import type { IOIMSlotEmptiness } from '../../engine/slot/interfaces/IOIMSlotEmptiness';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import { OIMDB } from '../OIMDB';
import { createOIMComputedService } from '../createOIMComputedService';

describe('replacing a default', () => {
    it('reaches a computed column when it is the computed column store', () => {
        const computedColumnSlotStoreService = new OIMSlotStoreServiceMapDriven<TOIMComputedColumnSlot, string>();
        OIMDefaults.COMPUTED_COLUMN_SLOT_STORE_SERVICE.setValue(computedColumnSlotStoreService);
        const summaryService = createOIMComputedService<void, { top: number }, TOIMSingleSlotStore<TOIMComputedSlot<{ top: number }, void>>>({
            computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<{ top: number }, void>>(),
        });
        const summary = summaryService.createComputedStoreSlot(new OIMDB(), () => ({ top: 1 }), () => ({}));
        const createStore = jest.spyOn(computedColumnSlotStoreService, 'createStore');

        summaryService.computedCollectionService.holdColumn(summaryService.computedCollectionService.getSlotByKey(summary, undefined), 'top');

        expect(createStore).toHaveBeenCalledTimes(1);
        expect(OIMDefaults.COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue()).toBe(computedColumnSlotStoreService);
    });

    it('takes, when nothing has read it yet', () => {
        const entitySlotEmptiness: IOIMSlotEmptiness<TOIMEntitySlot> = {
            isEmpty(_slot: TOIMEntitySlot): boolean { return false; },
        };
        OIMDefaults.ENTITY_SLOT_EMPTINESS.setValue(entitySlotEmptiness);
        expect(OIMDefaults.ENTITY_SLOT_EMPTINESS.getValue()).toBe(entitySlotEmptiness);
    });

    it('is refused once the getter has handed the first one out', () => {
        const handedOut = OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue();

        expect(() => {
            OIMDefaults.COLUMN_SLOT_STORE_SERVICE.setValue(new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>());
        })
            .toThrow(/OIMDefaults\.COLUMN_SLOT_STORE_SERVICE has already been handed out/);
        expect(OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()).toBe(handedOut);
    });

    it('names the property that was refused, not the one beside it', () => {
        expect(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()).toBeInstanceOf(OIMKeyTreeWalkScalar);

        expect(() => { OIMDefaults.KEY_TREE_WALK_SCALAR.setValue(new OIMKeyTreeWalkScalar()); })
            .toThrow(/OIMDefaults\.KEY_TREE_WALK_SCALAR /);
    });
});
