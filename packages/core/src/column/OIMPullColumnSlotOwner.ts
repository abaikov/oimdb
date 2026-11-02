import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import type { OIMComputedSlot } from '../computed/OIMComputedSlot';
import type { TOIMComputedContentSlot } from '../computed/types/TOIMComputedContentSlot';
import type { IOIMComputedValueService } from '../computed/interfaces/IOIMComputedValueService';
import type { TOIMComputedColumnSlot } from './types/TOIMComputedColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from './types/TOIMColumnSlotOwnerOptions';
import { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import { createOIMComputedSlot } from '../computed/utils/createOIMComputedSlot';
import { oimRefreshComputedSlot } from '../computed/utils/oimRefreshComputedSlot';
import { oimReleaseNoValue } from '../computed/utils/oimReleaseNoValue';

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
    public constructor(columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMComputedColumnSlot>, slotSubscriptionListener?: IOIMSlotSubscriptionListener) {
        super(columnSlotOwnerOptions, slotSubscriptionListener);
    }

    private readonly deriveColumnSlotValue = (columnSlot: TOIMComputedColumnSlot): unknown => {
        const columnGroup = this.columnGroupsByKey.get(columnSlot.key);
        return columnGroup === undefined
            ? this.deriveColumnValue(columnSlot)
            : this.deriveColumnValues(columnSlot, columnGroup.columnNames);
    };

    public getValueForSlot(computedSlot: TOIMComputedContentSlot): unknown {
        this.assertNotReleased(computedSlot);
        const columnSlot = computedSlot as TOIMComputedColumnSlot;
        oimRefreshComputedSlot(
            columnSlot,
            this.deriveColumnSlotValue,
            this.columnGroupsByKey.has(columnSlot.key) ? isSameColumnValues : Object.is,
            oimReleaseNoValue,
            columnSlot.storeSlot.channelSlot.clock,
        );
        return (columnSlot as unknown as OIMComputedSlot<unknown>).content;
    }

    protected createColumnSlot(carrierSlot: TOIMComputedContentSlot, key: string): TOIMComputedColumnSlot {
        const columnSlot = createOIMComputedSlot<unknown, string>(key, this, this, undefined, carrierSlot.storeSlot, undefined) as TOIMComputedColumnSlot;
        (columnSlot as TOIMEditable<TOIMComputedColumnSlot>).sourceComputeds = [carrierSlot];
        this.getValueForSlot(columnSlot);
        return columnSlot;
    }

    protected carrierSlotOf(columnSlot: TOIMComputedColumnSlot): TOIMComputedContentSlot {
        return columnSlot.sourceComputeds[0] as TOIMComputedContentSlot;
    }

    private deriveColumnValue(columnSlot: TOIMComputedColumnSlot): unknown {
        const carrierValue = (this.carrierSlotOf(columnSlot) as unknown as OIMComputedSlot<unknown>).content;
        return columnSlot.key === OIM_ANY_COLUMN_KEY ? carrierValue : columnValueOf(carrierValue, columnSlot.key);
    }

    private deriveColumnValues(columnSlot: TOIMComputedColumnSlot, columnNames: readonly string[]): unknown {
        const carrierValue = (this.carrierSlotOf(columnSlot) as unknown as OIMComputedSlot<unknown>).content;
        const columnValues: unknown[] = new Array(columnNames.length);
        for (let i = 0; i < columnNames.length; i++) columnValues[i] = columnValueOf(carrierValue, columnNames[i]);
        return columnValues;
    }
}
