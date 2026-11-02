import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import type { TOIMColumnSlot } from './types/TOIMColumnSlot';
import type { TOIMColumnSlotOwnerOptions } from './types/TOIMColumnSlotOwnerOptions';
import type { TOIMColumnGroup } from './types/TOIMColumnGroup';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import { OIMColumnSlotOwner } from './OIMColumnSlotOwner';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIM_ANY_COLUMN_KEY } from './constants/OIM_ANY_COLUMN_KEY';
import { OIMColumnSlot } from './OIMColumnSlot';

const hasValueColumn = (value: object, columnName: string): boolean =>
    Object.prototype.hasOwnProperty.call(value, columnName)
    && (value as Record<string, unknown>)[columnName] !== undefined;

export class OIMPushColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TOIMColumnSlot> {
    private readonly columnGroupsByColumnName: ReadonlyMap<string, readonly TOIMColumnGroup[]>;

    public constructor(columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TOIMColumnSlot>, slotSubscriptionListener?: IOIMSlotSubscriptionListener) {
        super(columnSlotOwnerOptions, slotSubscriptionListener);
        const columnGroupsByColumnName = new Map<string, TOIMColumnGroup[]>();
        for (const columnGroup of this.columnGroupsByKey.values()) {
            for (const columnName of columnGroup.columnNames) {
                const columnGroups = columnGroupsByColumnName.get(columnName);
                if (columnGroups === undefined) columnGroupsByColumnName.set(columnName, [columnGroup]);
                else columnGroups.push(columnGroup);
            }
        }
        this.columnGroupsByColumnName = columnGroupsByColumnName;
    }

    protected createColumnSlot(carrierSlot: TOIMSlot, key: string): TOIMColumnSlot {
        return new OIMColumnSlot(key, this, carrierSlot);
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
        const columnGroupsByColumnName = this.columnGroupsByColumnName;
        for (let i = 0; i < changed.length; i++) {
            const columnName = changed[i];
            const columnSlot = columnSlotStoreService.get(columnSlotStore, columnName);
            if (columnSlot !== undefined) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnSlot);
            const columnGroups = columnGroupsByColumnName.get(columnName);
            if (columnGroups === undefined) continue;
            for (let j = 0; j < columnGroups.length; j++) {
                const columnGroupSlot = columnSlotStoreService.get(columnSlotStore, columnGroups[j].key);
                if (columnGroupSlot !== undefined) OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnGroupSlot);
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
        const columnGroupsByKey = this.columnGroupsByKey;
        for (const columnSlot of columnSlots) {
            if (columnSlot.key === OIM_ANY_COLUMN_KEY) {
                OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, columnSlot);
                continue;
            }
            const columnGroup = columnGroupsByKey.get(columnSlot.key);
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
