import type { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import type { TOIMColumnGroup } from './types/TOIMColumnGroup';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';

export class OIMColumnSlotService<
    TSlot extends TOIMSlot, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot>,
> {
    private readonly columnSlotOwner: TColumnSlotOwner;

    public constructor(columnSlotOwner: TColumnSlotOwner) {
        this.columnSlotOwner = columnSlotOwner;
    }

    public getColumn(slot: TSlot, columnName: TColumnName): TColumnSlot {
        return this.columnSlotOwner.getColumn(slot, columnName, oimGetChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdColumn(slot: TSlot, columnName: TColumnName): TColumnSlot {
        return this.columnSlotOwner.holdColumn(slot, columnName);
    }

    public getAnyColumn(slot: TSlot): TColumnSlot {
        return this.columnSlotOwner.getAnyColumn(slot, oimGetChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdAnyColumn(slot: TSlot): TColumnSlot {
        return this.columnSlotOwner.holdAnyColumn(slot);
    }

    public getColumnGroup(columnNames: readonly TColumnName[]): TOIMColumnGroup {
        return this.columnSlotOwner.getColumnGroup(columnNames);
    }

    public holdColumnGroup(slot: TSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        return this.columnSlotOwner.holdColumnGroup(slot, columnGroup);
    }

    public unholdColumn(columnSlot: TColumnSlot): void {
        this.columnSlotOwner.unholdSlot(columnSlot);
    }
}
