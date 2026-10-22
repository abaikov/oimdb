import type { OIMColumnOwner } from '../../engine/column/OIMColumnOwner';
import type { TOIMColumnGroup } from '../../engine/column/types/TOIMColumnGroup';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import { oimGetChannelSlot } from '../../engine/slot/utils/oimGetChannelSlot';

export abstract class OIMSlotColumnService<
    TSlot extends TOIMSlot, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot>,
> {
    protected readonly columnOwner: TColumnOwner;

    protected constructor(columnOwner: TColumnOwner) {
        this.columnOwner = columnOwner;
    }

    public getColumn(slot: TSlot, columnName: TColumnName): TColumnSlot {
        return this.columnOwner.getColumn(slot, columnName, oimGetChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdColumn(slot: TSlot, columnName: TColumnName): TColumnSlot {
        return this.columnOwner.holdColumn(slot, columnName);
    }

    public getAnyColumn(slot: TSlot): TColumnSlot {
        return this.columnOwner.getAnyColumn(slot, oimGetChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdAnyColumn(slot: TSlot): TColumnSlot {
        return this.columnOwner.holdAnyColumn(slot);
    }

    public getColumnGroup(columnNames: readonly TColumnName[]): TOIMColumnGroup {
        return this.columnOwner.getColumnGroup(columnNames);
    }

    public holdColumnGroup(slot: TSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        return this.columnOwner.holdColumnGroup(slot, columnGroup);
    }

    public unholdColumn(columnSlot: TColumnSlot): void {
        this.columnOwner.unholdSlot(columnSlot);
    }
}
