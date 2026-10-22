import type { TOIMComputedSlot } from '../computed/types/TOIMComputedSlot';
import type { IOIMComputedValueService } from '../computed/interfaces/IOIMComputedValueService';
import type { TOIMComputedColumnSlot } from './types/TOIMComputedColumnSlot';
import type { TOIMColumnOwnerOptions } from './types/TOIMColumnOwnerOptions';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import { OIMColumnOwner } from './OIMColumnOwner';
import { oimColumnSlotStoreServiceOfColumnOwnerOptions } from './utils/oimColumnSlotStoreServiceOfColumnOwnerOptions';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import { createOIMComputedSlot } from '../computed/utils/createOIMComputedSlot';
import { OIM_FROZEN_EMPTY_COMPUTED_SLOTS } from '../computed/constants/OIM_FROZEN_EMPTY_COMPUTED_SLOTS';
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

export class OIMColumnOwnerPullDriven
    extends OIMColumnOwner<TOIMComputedSlot, TOIMComputedColumnSlot>
    implements IOIMComputedValueService {
    public constructor(options: TOIMColumnOwnerOptions<TOIMComputedColumnSlot>) {
        super(oimColumnSlotStoreServiceOfColumnOwnerOptions(options));
    }

    private readonly deriveColumnSlotValue = (columnSlot: TOIMComputedColumnSlot): unknown => {
        const columnGroup = this.getColumnGroupsByKeyOf(this.carrierSlotOf(columnSlot))?.get(columnSlot.key);
        return columnGroup === undefined
            ? this.deriveColumnValue(columnSlot)
            : this.deriveColumnValues(columnSlot, columnGroup.columnNames);
    };

    public getValueForSlot(computedSlot: TOIMComputedSlot): unknown {
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

    protected createColumnSlot(carrierSlot: TOIMComputedSlot, key: string): TOIMComputedColumnSlot {
        const columnSlot = createOIMComputedSlot<unknown, string>(
            key, this, this, OIM_FROZEN_EMPTY_COMPUTED_SLOTS, [carrierSlot], undefined,
        );
        this.getValueForSlot(columnSlot);
        return columnSlot;
    }

    protected carrierSlotOf(columnSlot: TOIMComputedColumnSlot): TOIMComputedSlot {
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
