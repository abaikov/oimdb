import type { TOIMComputedContentSlot } from '../computed/types/TOIMComputedContentSlot';
import type { IOIMComputedValueService } from '../computed/interfaces/IOIMComputedValueService';
import type { TOIMComputedColumnSlot } from './types/TOIMComputedColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from './types/TOIMColumnSlotOwnerOptions';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import { oimColumnSlotStoreServiceOfColumnOwnerOptions } from './utils/oimColumnSlotStoreServiceOfColumnOwnerOptions';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import type { TOIMSlotEditable } from '../slot/types/TOIMSlotEditable';
import { createOIMComputedSlot } from '../computed/utils/createOIMComputedSlot';
import { oimRefreshComputedSlot } from '../computed/utils/oimRefreshComputedSlot';

const columnValueOf = (value: unknown, columnName: string): unknown =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[columnName] : undefined;

const isSameColumnValues = (prevColumnValues: unknown, nextColumnValues: unknown): boolean => {
    if (!Array.isArray(prevColumnValues) || !Array.isArray(nextColumnValues)) return false;
    if (prevColumnValues.length !== nextColumnValues.length) return false;
    for (let i = 0; i < nextColumnValues.length; i++) {
        if (!Object.is(prevColumnValues[i], nextColumnValues[i])) return false;
    }
    return true;
};

export class OIMPullColumnSlotOwner
    extends OIMColumnSlotOwner<TOIMComputedContentSlot, TOIMComputedColumnSlot>
    implements IOIMComputedValueService {
    public constructor(options: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot>) {
        super(oimColumnSlotStoreServiceOfColumnOwnerOptions(options));
    }

    private readonly deriveColumnSlotValue = (columnSlot: TOIMComputedColumnSlot): unknown => {
        const columnGroup = this.getColumnGroupsByKeyOf(this.carrierSlotOf(columnSlot))?.get(columnSlot.key);
        return columnGroup === undefined
            ? this.deriveColumnValue(columnSlot)
            : this.deriveColumnValues(columnSlot, columnGroup.columnNames);
    };

    public getValueForSlot(computedSlot: TOIMComputedContentSlot): unknown {
        this.assertNotReleased(computedSlot);
        const columnSlot = computedSlot as TOIMComputedColumnSlot;
        const carrierStoreSlot = this.carrierSlotOf(columnSlot).storeSlot as TOIMStoreSlot;
        oimRefreshComputedSlot(
            columnSlot,
            this.deriveColumnSlotValue,
            carrierStoreSlot.columnGroupsByKey?.has(columnSlot.key) === true ? isSameColumnValues : Object.is,
            carrierStoreSlot.channelSlot.clock,
        );
        return columnSlot.value;
    }

    protected createColumnSlot(carrierSlot: TOIMComputedContentSlot, key: string): TOIMComputedColumnSlot {
        const columnSlot = createOIMComputedSlot<unknown, string>(key, this, this, undefined);
        (columnSlot as TOIMSlotEditable<TOIMComputedColumnSlot>).sourceComputeds = [carrierSlot];
        this.getValueForSlot(columnSlot);
        return columnSlot;
    }

    protected carrierSlotOf(columnSlot: TOIMComputedColumnSlot): TOIMComputedContentSlot {
        return columnSlot.sourceComputeds[0];
    }

    private deriveColumnValue(columnSlot: TOIMComputedColumnSlot): unknown {
        const carrierValue = this.carrierSlotOf(columnSlot).value;
        return columnSlot.key === OIM_ANY_COLUMN_KEY ? carrierValue : columnValueOf(carrierValue, columnSlot.key);
    }

    private deriveColumnValues(columnSlot: TOIMComputedColumnSlot, columnNames: readonly string[]): unknown {
        const carrierValue = this.carrierSlotOf(columnSlot).value;
        const columnValues: unknown[] = new Array(columnNames.length);
        for (let i = 0; i < columnNames.length; i++) columnValues[i] = columnValueOf(carrierValue, columnNames[i]);
        return columnValues;
    }
}
