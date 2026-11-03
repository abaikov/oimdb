import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import type { TOIMColumnGroup } from './types/TOIMColumnGroup';
import type { TOIMColumnSlotOwnerOptions } from './types/TOIMColumnSlotOwnerOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import { OIMSlotOwner } from '../slot/OIMSlotOwner';
import type { TOIMUnusedSlotCollectorSlot } from '../collector/types/TOIMUnusedSlotCollectorSlot';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import { markOIMSlotReleased } from '../slot/utils/markOIMSlotReleased';
import { getOIMColumnSlotStoreService } from './utils/getOIMColumnSlotStoreService';
import { peekOIMSlotContentService } from '../slot/utils/peekOIMSlotContentService';

export abstract class OIMColumnSlotOwner<
    TCarrierSlot extends TOIMSlot, TColumnSlot extends TOIMKeyedSlot<string>,
> extends OIMSlotOwner {
    protected readonly columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>;

    protected readonly columnGroupsByKey: ReadonlyMap<string, TOIMColumnGroup>;

    protected constructor(columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TColumnSlot>, slotSubscriptionListener: IOIMSlotSubscriptionListener | undefined) {
        super(slotSubscriptionListener);
        this.columnSlotStoreService = getOIMColumnSlotStoreService(columnSlotOwnerOptions);
        const columnGroupsByKey = new Map<string, TOIMColumnGroup>();
        const columnGroups = columnSlotOwnerOptions.columnGroups ?? [];
        for (let i = 0; i < columnGroups.length; i++) columnGroupsByKey.set(columnGroups[i].key, columnGroups[i]);
        this.columnGroupsByKey = columnGroupsByKey;
    }

    protected abstract createColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot;

    protected abstract carrierSlotOf(columnSlot: TColumnSlot): TCarrierSlot;

    public abstract trackSourceColumnSlot(columnSlot: TColumnSlot): void;

    protected peekCarrierColumnValue(columnSlot: TColumnSlot): unknown {
        const carrierSlot = this.carrierSlotOf(columnSlot);
        const carrierContentService = peekOIMSlotContentService(carrierSlot);
        const columnKey = columnSlot.key;
        if (columnKey === OIM_ANY_COLUMN_KEY) return carrierContentService.peekAnyColumnValue(carrierSlot);
        const columnGroup = this.columnGroupsByKey.get(columnKey);
        return columnGroup === undefined
            ? carrierContentService.peekColumnValue(carrierSlot, columnKey)
            : carrierContentService.peekColumnGroupValue(carrierSlot, columnGroup.columnNames);
    }

    public getColumnGroupSlot(
        carrierSlot: TCarrierSlot, columnGroup: TOIMColumnGroup, unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot,
    ): TColumnSlot {
        this.assertColumnGroupDeclared(columnGroup);
        return this.getColumnSlot(carrierSlot, columnGroup.key, unusedSlotCollectorSlot);
    }

    public holdColumnGroupSlot(carrierSlot: TCarrierSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        this.assertColumnGroupDeclared(columnGroup);
        return this.holdColumnSlot(carrierSlot, columnGroup.key);
    }

    public getAnyColumnSlot(carrierSlot: TCarrierSlot, unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot): TColumnSlot {
        return this.getColumnSlot(carrierSlot, OIM_ANY_COLUMN_KEY, unusedSlotCollectorSlot);
    }

    public holdAnyColumnSlot(carrierSlot: TCarrierSlot): TColumnSlot {
        return this.holdColumnSlot(carrierSlot, OIM_ANY_COLUMN_KEY);
    }

    public getColumnSlot(
        carrierSlot: TCarrierSlot, key: string, unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot,
    ): TColumnSlot {
        const storedColumnSlot = this.peekFiledColumnSlot(carrierSlot, key);
        if (storedColumnSlot !== undefined) return storedColumnSlot;
        const columnSlot = this.mintColumnSlot(carrierSlot, key);
        OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(unusedSlotCollectorSlot, columnSlot);
        return columnSlot;
    }

    public holdColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot {
        const columnSlot = this.peekFiledColumnSlot(carrierSlot, key) ?? this.mintColumnSlot(carrierSlot, key);
        this.holdSlot(columnSlot);
        return columnSlot;
    }

    public override releaseSlotIfUnheld(slot: TOIMSlot): void {
        if (slot.holdCount > 0) return;
        const columnSlot = slot as TColumnSlot;
        const carrierSlot = this.carrierSlotOf(columnSlot);
        const columnSlotStore = carrierSlot.columnSlotStore;
        if (columnSlotStore === undefined) return;
        const columnSlotStoreService = this.columnSlotStoreService;
        if (columnSlotStoreService.get(columnSlotStore, columnSlot.key) !== columnSlot) return;
        columnSlotStoreService.delete(columnSlotStore, columnSlot);
        if (columnSlotStoreService.getSlotCount(columnSlotStore) === 0) {
            (carrierSlot as TOIMEditable<TOIMSlot>).columnSlotStore = undefined;
        }
        markOIMSlotReleased(columnSlot);
        carrierSlot.owner.releaseSlotIfUnheld(carrierSlot);
    }

    private assertColumnGroupDeclared(columnGroup: TOIMColumnGroup): void {
        if (this.columnGroupsByKey.has(columnGroup.key)) return;
        throw new Error(
            `OIMColumnSlotOwner: the column group [${columnGroup.columnNames.join(', ')}] is not among the column groups `
            + 'this collection was created with, so no slot can be filed for it. Name it in `columnGroups`.',
        );
    }

    private peekFiledColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot | undefined {
        const columnSlotStore = carrierSlot.columnSlotStore;
        return columnSlotStore === undefined ? undefined : this.columnSlotStoreService.get(columnSlotStore, key);
    }

    private mintColumnSlot(carrierSlot: TCarrierSlot, key: string): TColumnSlot {
        const columnSlotStoreService = this.columnSlotStoreService;
        const editableCarrierSlot = carrierSlot as TOIMEditable<TOIMSlot>;
        const filedColumnSlotStore = editableCarrierSlot.columnSlotStore;
        const columnSlotStore = filedColumnSlotStore ?? columnSlotStoreService.createStore();
        const columnSlot = this.createColumnSlot(carrierSlot, key);
        columnSlotStoreService.set(columnSlotStore, columnSlot);
        if (filedColumnSlotStore === undefined) editableCarrierSlot.columnSlotStore = columnSlotStore;
        return columnSlot;
    }
}
