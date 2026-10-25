import { OIMDefaults } from '../OIMDefaults';
import { OIMSlotMapStoreService } from '../../engine/store/OIMSlotMapStoreService';
import type { TOIMColumnSlot } from '../../engine/column/types/TOIMColumnSlot';
import { OIMScalarKeyTreeWalk } from '../../engine/key/OIMScalarKeyTreeWalk';
import type { IOIMSlotEmptinessPolicy } from '../../engine/slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMComputedColumnSlot } from '../../engine/column/types/TOIMComputedColumnSlot';
import { OIMDB } from '../OIMDB';
import { createOIMSingleComputedService } from '../createOIMSingleComputedService';

describe('replacing a default', () => {
    it('reaches a computed column when it is the computed column store', () => {
        const computedColumnSlotStoreService = new OIMSlotMapStoreService<TOIMComputedColumnSlot, string>();
        OIMDefaults.COMPUTED_COLUMN_SLOT_STORE_SERVICE.setValue(computedColumnSlotStoreService);
        const summaryService = createOIMSingleComputedService<{ top: number }>();
        const summary = summaryService.createComputedStoreSlot(new OIMDB(), () => ({ top: 1 }), () => ({}));
        const createStore = jest.spyOn(computedColumnSlotStoreService, 'createStore');

        summaryService.computedSingleSlotService.columnSlotService.holdColumn(summaryService.computedSingleSlotService.getSingleSlot(summary), 'top');

        expect(createStore).toHaveBeenCalledTimes(1);
        expect(OIMDefaults.COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue()).toBe(computedColumnSlotStoreService);
    });

    it('takes, when nothing has read it yet', () => {
        const entitySlotEmptiness: IOIMSlotEmptinessPolicy<TOIMEntitySlot> = {
            isEmpty(_slot: TOIMEntitySlot): boolean { return false; },
        };
        OIMDefaults.ENTITY_SLOT_EMPTINESS.setValue(entitySlotEmptiness);
        expect(OIMDefaults.ENTITY_SLOT_EMPTINESS.getValue()).toBe(entitySlotEmptiness);
    });

    it('is refused once the getter has handed the first one out', () => {
        const handedOut = OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue();

        expect(() => {
            OIMDefaults.COLUMN_SLOT_STORE_SERVICE.setValue(new OIMSlotMapStoreService<TOIMColumnSlot>());
        })
            .toThrow(/OIMDefaults\.COLUMN_SLOT_STORE_SERVICE has already been handed out/);
        expect(OIMDefaults.COLUMN_SLOT_STORE_SERVICE.getValue()).toBe(handedOut);
    });

    it('names the property that was refused, not the one beside it', () => {
        expect(OIMDefaults.KEY_TREE_WALK_SCALAR.getValue()).toBeInstanceOf(OIMScalarKeyTreeWalk);

        expect(() => { OIMDefaults.KEY_TREE_WALK_SCALAR.setValue(new OIMScalarKeyTreeWalk()); })
            .toThrow(/OIMDefaults\.KEY_TREE_WALK_SCALAR /);
    });
});
