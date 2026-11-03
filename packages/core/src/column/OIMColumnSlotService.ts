import type { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import type { TOIMColumnGroup } from './types/TOIMColumnGroup';
import type { TOIMKeyedSlot } from '../slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { peekOIMChannelSlot } from '../slot/utils/peekOIMChannelSlot';

export class OIMColumnSlotService<
    TSlot extends TOIMSlot, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot>,
> {
    private readonly columnSlotOwner: TColumnSlotOwner;

    public constructor(columnSlotOwner: TColumnSlotOwner) {
        this.columnSlotOwner = columnSlotOwner;
    }

    public getColumnSlot(slot: TSlot, columnName: TColumnName): TColumnSlot {
        return this.columnSlotOwner.getColumnSlot(slot, columnName, peekOIMChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdColumnSlot(slot: TSlot, columnName: TColumnName): TColumnSlot {
        return this.columnSlotOwner.holdColumnSlot(slot, columnName);
    }

    public getAnyColumnSlot(slot: TSlot): TColumnSlot {
        return this.columnSlotOwner.getAnyColumnSlot(slot, peekOIMChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdAnyColumnSlot(slot: TSlot): TColumnSlot {
        return this.columnSlotOwner.holdAnyColumnSlot(slot);
    }

    public getColumnGroupSlot(slot: TSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        return this.columnSlotOwner.getColumnGroupSlot(slot, columnGroup, peekOIMChannelSlot(slot).collectorSlot.unusedSlotCollectorSlot);
    }

    public holdColumnGroupSlot(slot: TSlot, columnGroup: TOIMColumnGroup): TColumnSlot {
        return this.columnSlotOwner.holdColumnGroupSlot(slot, columnGroup);
    }

    public unholdColumnSlot(columnSlot: TColumnSlot): void {
        this.columnSlotOwner.unholdSlot(columnSlot);
    }
}
