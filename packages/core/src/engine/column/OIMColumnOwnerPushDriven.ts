import type { TOIMColumnSlot } from './types/TOIMColumnSlot';
import type { TOIMColumnOwnerOptions } from './types/TOIMColumnOwnerOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import { OIMColumnOwner } from './OIMColumnOwner';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import { oimColumnSlotStoreServiceOfColumnOwnerOptions } from './utils/oimColumnSlotStoreServiceOfColumnOwnerOptions';
import { OIM_SLOT_FLAG_EMPTY } from '../slot/constants/OIM_SLOT_FLAG_EMPTY';

const hasValueColumn = (value: object, columnName: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, columnName)
    && (value as Record<string, unknown>)[columnName] !== undefined;

export class OIMColumnOwnerPushDriven extends OIMColumnOwner<TOIMSlot, TOIMColumnSlot> {
    public constructor(options: TOIMColumnOwnerOptions<TOIMColumnSlot>) {
        super(oimColumnSlotStoreServiceOfColumnOwnerOptions(options));
    }

    protected createColumnSlot(carrierSlot: TOIMSlot, key: string): TOIMColumnSlot {
        return {
            effects: undefined,
            changedAtRevision: carrierSlot.changedAtRevision,
            changedAtEpoch: carrierSlot.changedAtEpoch,
            effectEdges: undefined,
            holdCount: 0,
            releaseDueAfterWriteMs: -1,
            releaseDueAfterIdleMs: -1,
            releaseDueAfterUnholdMs: -1,
            slotFlags: OIM_SLOT_FLAG_EMPTY,
            columnSlotStore: undefined,
            storeSlot: undefined,
            owner: this,
            key,
            carrierSlot,
        };
    }

    protected carrierSlotOf(columnSlot: TOIMColumnSlot): TOIMSlot {
        return columnSlot.carrierSlot;
    }

    public markColumnsChanged(
        carrierSlot: TOIMSlot, patch: object | undefined, changedColumns: readonly string[] | undefined,
        channelSlot: TOIMChannelSlot,
    ): void {
        if (changedColumns !== undefined) this.markListedColumnsChanged(carrierSlot, changedColumns, channelSlot);
        else if (patch !== undefined) this.markValueColumnsChanged(carrierSlot, patch, channelSlot);
        else this.markAllColumnsChanged(carrierSlot, channelSlot);
    }

    private markListedColumnsChanged(
        carrierSlot: TOIMSlot, changed: readonly string[], channelSlot: TOIMChannelSlot,
    ): void {
        const columnSlotStore = carrierSlot.columnSlotStore;
        if (columnSlotStore === undefined || changed.length === 0) return;
        const columnSlotStoreService = this.columnSlotStoreService;
        const columnReadersByColumnName = this.getColumnReadersOf(carrierSlot);
        if (columnReadersByColumnName !== undefined) {
            for (let i = 0; i < changed.length; i++) {
                const columnName = changed[i];
                const columnReaders = columnReadersByColumnName.get(columnName);
                if (columnReaders === undefined) continue;
                if (columnReaders.columnSlotCount !== 0) {
                    const slot = columnSlotStoreService.get(columnSlotStore, columnName);
                    if (slot !== undefined) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot);
                }
                const columnGroups = columnReaders.columnGroups;
                for (let j = 0; j < columnGroups.length; j++) {
                    const columnGroupSlot = columnSlotStoreService.get(columnSlotStore, columnGroups[j].key);
                    if (columnGroupSlot !== undefined) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnGroupSlot);
                }
            }
        }
        const anyColumnSlot = columnSlotStoreService.get(columnSlotStore, OIM_ANY_COLUMN_KEY);
        if (anyColumnSlot !== undefined) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, anyColumnSlot);
    }

    private markAllColumnsChanged(carrierSlot: TOIMSlot, channelSlot: TOIMChannelSlot): void {
        const columnSlotStore = carrierSlot.columnSlotStore;
        if (columnSlotStore === undefined) return;
        const columnSlots = this.columnSlotStoreService.getSlots(columnSlotStore);
        for (const columnSlot of columnSlots) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnSlot);
    }

    private markValueColumnsChanged(
        carrierSlot: TOIMSlot, value: object, channelSlot: TOIMChannelSlot,
    ): void {
        const columnSlotStore = carrierSlot.columnSlotStore;
        if (columnSlotStore === undefined) return;
        const columnSlots = this.columnSlotStoreService.getSlots(columnSlotStore);
        const columnGroupsByKey = this.getColumnGroupsByKeyOf(carrierSlot);
        for (const columnSlot of columnSlots) {
            if (columnSlot.key === OIM_ANY_COLUMN_KEY) {
                OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnSlot);
                continue;
            }
            const columnGroup = columnGroupsByKey?.get(columnSlot.key);
            if (columnGroup === undefined) {
                if (hasValueColumn(value, columnSlot.key)) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnSlot);
                continue;
            }
            const columnNames = columnGroup.columnNames;
            for (let i = 0; i < columnNames.length; i++) {
                if (!hasValueColumn(value, columnNames[i])) continue;
                OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnSlot);
                break;
            }
        }
    }
}
