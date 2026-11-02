import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { OIMEntitySlot } from './OIMEntitySlot';
import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { IOIMSlotContentWriter } from '../slot/interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { TOIMEntitySlotOwnerService } from './types/TOIMEntitySlotOwnerService';
import type { TOIMEntityContentServiceOptions } from './types/TOIMEntityContentServiceOptions';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import { oimIsSlotEmpty } from '../slot/utils/oimIsSlotEmpty';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import { OIMSlotEntityPresenceEmptinessPolicy } from './OIMSlotEntityPresenceEmptinessPolicy';
import { createOIMEntitySlot } from './utils/createOIMEntitySlot';
import { createOIMEntityContentSlot } from './utils/createOIMEntityContentSlot';
import { oimAssertSlotUnheld } from '../slot/utils/oimAssertSlotUnheld';

import { OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS } from '../slot/constants/OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS';
export class OIMEntityContentService<
    TEntity extends object, TKey extends NonNullable<unknown> = TOIMStoreKey, TColumnName extends string = string,
> implements IOIMSlotContentWriter<TOIMEntityContentSlot<TEntity>, TEntity>, IOIMSlotContentService<TOIMEntityContentSlot<TEntity>>,
    IOIMKeyedSlotCreator<TKey, TOIMEntitySlot<TEntity, TKey>>, IOIMSingleSlotCreator<TOIMEntityContentSlot<TEntity>> {
    private readonly entityWriter: IOIMEntityWriter;

    private readonly slotEmptinessPolicy: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot<TEntity>>;

    private readonly isSlotEmptinessCustom: boolean;

    public constructor(options: TOIMEntityContentServiceOptions<TEntity>) {
        this.entityWriter = options.entityWriter;
        this.slotEmptinessPolicy = options.slotEmptinessPolicy;
        this.isSlotEmptinessCustom = options.slotEmptinessPolicy !== OIMSlotEntityPresenceEmptinessPolicy.INSTANCE;
    }

    public createSlot(key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMEntitySlot<TEntity, TKey, Extract<TColumnName, TOIMEntityColumnName<TEntity>>> {
        return createOIMEntitySlot<TEntity, TKey, Extract<TColumnName, TOIMEntityColumnName<TEntity>>>(key, slotOwner, storeSlot);
    }

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMEntityContentSlot<TEntity> {
        return createOIMEntityContentSlot<TEntity>(slotOwner, storeSlot);
    }

    public isSlotEmpty(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return this.slotEmptinessPolicy.isEmpty(entitySlot);
    }

    private updatesEmptinessOnColumnWriteOf(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return this.isSlotEmptinessCustom || this.slotOwnerServiceOf(entitySlot).settlesWrittenSlots;
    }

    private isAnyColumnReferenced(entitySlot: TOIMEntityContentSlot<TEntity>, changedColumns: readonly string[]): boolean {
        return (entitySlot.columnSlotStore !== undefined && changedColumns.length !== 0)
            || this.slotOwnerServiceOf(entitySlot).isAnyColumnRead(entitySlot.storeSlot, changedColumns);
    }

    private takeChangedColumnNames(channelSlot: TOIMChannelSlot): string[] {
        const changedColumnNames = channelSlot.changedColumnNames;
        if (changedColumnNames === undefined) return (channelSlot.changedColumnNames = []);
        if (changedColumnNames.length !== 0) changedColumnNames.length = 0;
        return changedColumnNames;
    }

    private slotOwnerServiceOf(
        entitySlot: TOIMEntityContentSlot<TEntity>,
    ): TOIMEntitySlotOwnerService<TEntity, TOIMEntityContentSlot<TEntity>, unknown, TColumnName> {
        return entitySlot.owner as TOIMEntitySlotOwnerService<TEntity, TOIMEntityContentSlot<TEntity>, unknown, TColumnName>;
    }

    public insertSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity, changedEntitySlots?: TOIMEntityContentSlot<TEntity>[]): void {
        if (this.isOnFastPath(entitySlot)) {
            this.insertEntityOnFastPath(entitySlot, entity, changedEntitySlots);
            return;
        }
        this.insertEntityOffFastPath(entitySlot, entity, changedEntitySlots);
    }

    private insertEntityOnFastPath(
        entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity, changedEntitySlots: TOIMEntityContentSlot<TEntity>[] | undefined,
    ): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        try {
            slotOwnerService.assertWritable(entitySlot);
            this.entityWriter.fillEntity(entitySlot as unknown as OIMEntitySlot, entity);
            this.updateEntitySlotEmptiness(entitySlot);
            const channelSlot = oimGetChannelSlot(entitySlot);
            if (oimIsSlotEmpty(entitySlot)) OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(channelSlot.collectorSlot.unusedSlotCollectorSlot, entitySlot);
            OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
        } catch (refusal) {
            slotOwnerService.releaseSlotIfUnheld(entitySlot);
            throw refusal;
        }
        if (changedEntitySlots !== undefined) changedEntitySlots.push(entitySlot);
    }

    private insertEntityOffFastPath(
        entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity, changedEntitySlots: TOIMEntityContentSlot<TEntity>[] | undefined,
    ): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        let isLanded: boolean;
        try {
            slotOwnerService.assertWritable(entitySlot);
            isLanded = this.writeEntityToSlot(entitySlot, entity, undefined);
            this.updateEntitySlotEmptiness(entitySlot);
        } catch (refusal) {
            slotOwnerService.releaseSlotIfUnheld(entitySlot);
            throw refusal;
        }
        if (oimIsSlotEmpty(entitySlot)) {
            const unusedSlotCollectorSlot = oimGetChannelSlot(entitySlot).collectorSlot.unusedSlotCollectorSlot;
            OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(unusedSlotCollectorSlot, entitySlot);
        }
        if (!isLanded) return;
        slotOwnerService.dispatchContentChange(entitySlot, entity);
        if (!oimIsSlotEmpty(entitySlot)) slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
        if (changedEntitySlots !== undefined) changedEntitySlots.push(entitySlot);
    }

    /** @deprecated Use `slot.writeSlotContent(…)`; removed in 5.0. */
    public writeSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity): boolean {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.assertWritable(entitySlot);
        if ((entitySlot as unknown as OIMEntitySlot<TEntity>).content !== undefined && this.isOnFastPath(entitySlot)) {
            if (!this.entityWriter.putEntity(entitySlot as unknown as OIMEntitySlot, entity, undefined)) return false;
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return true;
        }
        if ((entitySlot as unknown as OIMEntitySlot<TEntity>).content !== undefined && !this.updatesEmptinessOnColumnWriteOf(entitySlot)) {
            const channelSlot = oimGetChannelSlot(entitySlot);
            const changedColumnNames = this.takeChangedColumnNames(channelSlot);
            if (!this.entityWriter.putEntity(entitySlot as unknown as OIMEntitySlot, entity, changedColumnNames)) return false;
            if (!this.isAnyColumnReferenced(entitySlot, changedColumnNames) && (entitySlot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) === 0) {
                this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
                return true;
            }
            this.dispatchColumnsChanged(entitySlot, undefined, changedColumnNames);
            if (!slotOwnerService.hasContentChangeListeners(entitySlot)) {
                slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
                return true;
            }
            this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, entity, changedColumnNames);
            return true;
        }
        const channelSlot = oimGetChannelSlot(entitySlot);
        const wasEmpty = oimIsSlotEmpty(entitySlot);
        const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
            ? this.takeChangedColumnNames(channelSlot)
            : undefined;
        const isLanded = this.writeEntityToSlot(entitySlot, entity, changedColumnNames);
        if (isLanded) {
            this.updateEntitySlotEmptiness(entitySlot);
            this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, entity, wasEmpty ? undefined : changedColumnNames);
        }
        return isLanded;
    }

    /** @deprecated Use `slot.updateEntity(…)`; removed in 5.0. */
    public updateEntity<TEntitySlot extends TOIMEntityContentSlot<TEntity>>(entitySlot: TEntitySlot, patch: Partial<TEntity>): TEntitySlot {
        this.slotOwnerServiceOf(entitySlot).assertWritable(entitySlot);
        if (!this.isOnFastPath(entitySlot)) return this.updateEntityOffFastPath(entitySlot, patch);
        if (!this.entityWriter.patchEntity(entitySlot as unknown as OIMEntitySlot, patch, undefined)) return entitySlot;
        this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
        return entitySlot;
    }

    /** @deprecated Use `slot.updateEntityColumn(…)`; removed in 5.0. */
    public updateEntityColumn<TColumn extends keyof TEntity & string, TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnName: TColumn, value: TEntity[TColumn],
    ): TEntitySlot {
        this.slotOwnerServiceOf(entitySlot).assertWritable(entitySlot);
        if (!this.isOnFastPath(entitySlot)) return this.updateEntityColumnOffFastPath(entitySlot, columnName, value);
        if (!this.entityWriter.patchColumn(entitySlot as unknown as OIMEntitySlot, columnName, value, undefined)) return entitySlot;
        this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
        return entitySlot;
    }

    /** @deprecated Use `slot.deleteEntityColumns(…)`; removed in 5.0. */
    public deleteEntityColumns<TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnNames: readonly TOIMEntityColumnName<TEntity>[],
    ): TEntitySlot {
        this.slotOwnerServiceOf(entitySlot).assertWritable(entitySlot);
        const deletedColumnNames = this.entityWriter.deleteColumns(entitySlot as unknown as OIMEntitySlot, columnNames);
        if (deletedColumnNames.length !== 0) {
            this.dispatchColumnsChanged(entitySlot, undefined, deletedColumnNames);
            this.updateEntitySlotEmptiness(entitySlot);
            this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, undefined, deletedColumnNames);
        }
        return entitySlot;
    }

    /** @deprecated Use `slot.markEntityChanged(…)`; removed in 5.0. */
    public markEntityChanged(entitySlot: TOIMEntityContentSlot<TEntity>, changedColumns?: readonly (keyof TEntity & string)[]): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.assertWritable(entitySlot);
        if (changedColumns !== undefined && changedColumns.length === 0) return;
        if (
            changedColumns !== undefined && !this.updatesEmptinessOnColumnWriteOf(entitySlot) && (entitySlot as unknown as OIMEntitySlot<TEntity>).content !== undefined
            && !this.isAnyColumnReferenced(entitySlot, changedColumns) && (entitySlot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) === 0
        ) {
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return;
        }
        const channelSlot = oimGetChannelSlot(entitySlot);
        const hasColumnSlots = slotOwnerService.hasColumnSlots(entitySlot);
        const isObserved = changedColumns === undefined || !hasColumnSlots || this.isAnyColumnReferenced(entitySlot, changedColumns);
        if (hasColumnSlots && isObserved) {
            slotOwnerService.columnSlotOwner.markColumnsChanged(entitySlot, undefined, changedColumns, channelSlot);
        }
        if ((entitySlot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) !== 0) {
            OIMChannelService.INSTANCE.wakeColumnFilteredSubscribers(channelSlot, entitySlot, changedColumns);
        }
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
        if (this.updatesEmptinessOnColumnWriteOf(entitySlot) || changedColumns === undefined || (entitySlot as unknown as OIMEntitySlot<TEntity>).content === undefined) {
            this.updateEntitySlotEmptiness(entitySlot);
        }
        if (isObserved) slotOwnerService.dispatchContentChange(entitySlot, undefined, changedColumns);
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    /** @deprecated Use `slot.clearSlotContent(…)`; removed in 5.0. */
    public clearSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.assertWritable(entitySlot);
        const channelSlot = oimGetChannelSlot(entitySlot);
        if (!this.isOnFastPath(entitySlot)) {
            this.clearEntityAndMarkColumns(entitySlot);
            slotOwnerService.settleEmptiness(entitySlot, this.slotEmptinessPolicy.isEmpty(entitySlot));
            slotOwnerService.dispatchContentChange(entitySlot);
            slotOwnerService.releaseSlotIfUnheld(entitySlot);
            return;
        }
        if ((entitySlot as unknown as OIMEntitySlot<TEntity>).content !== undefined) {
            this.entityWriter.clearEntity(entitySlot as unknown as OIMEntitySlot);
            OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
            slotOwnerService.markEmptiness(entitySlot, this.slotEmptinessPolicy.isEmpty(entitySlot));
        }
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    private updateEntityOffFastPath<TEntitySlot extends TOIMEntityContentSlot<TEntity>>(entitySlot: TEntitySlot, patch: Partial<TEntity>): TEntitySlot {
        const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
            ? this.takeChangedColumnNames(oimGetChannelSlot(entitySlot))
            : undefined;
        if (this.entityWriter.patchEntity(entitySlot as unknown as OIMEntitySlot, patch, changedColumnNames)) {
            this.dispatchPatchWritten(entitySlot, patch, changedColumnNames);
        }
        return entitySlot;
    }

    private updateEntityColumnOffFastPath<TColumn extends keyof TEntity & string, TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnName: TColumn, value: TEntity[TColumn],
    ): TEntitySlot {
        if (this.updatesEmptinessOnColumnWriteOf(entitySlot) || (entitySlot as unknown as OIMEntitySlot<TEntity>).content === undefined) {
            return this.updateEntityColumnAndDispatch(entitySlot, columnName, value);
        }
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        const channelSlot = oimGetChannelSlot(entitySlot);
        const columnNames = this.takeChangedColumnNames(channelSlot);
        columnNames.push(columnName);
        if (!this.isAnyColumnReferenced(entitySlot, columnNames) && (entitySlot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) === 0) {
            if (!this.entityWriter.patchColumn(entitySlot as unknown as OIMEntitySlot, columnName, value, undefined)) return entitySlot;
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return entitySlot;
        }
        if (slotOwnerService.hasContentChangeListeners(entitySlot)) {
            return this.updateEntityColumnAndDispatch(entitySlot, columnName, value);
        }
        if (!this.entityWriter.patchColumn(entitySlot as unknown as OIMEntitySlot, columnName, value, undefined)) return entitySlot;
        this.dispatchColumnsChanged(entitySlot, undefined, columnNames);
        slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
        return entitySlot;
    }

    private updateEntityColumnAndDispatch<TColumn extends keyof TEntity & string, TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnName: TColumn, value: TEntity[TColumn],
    ): TEntitySlot {
        const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
            ? this.takeChangedColumnNames(oimGetChannelSlot(entitySlot))
            : undefined;
        if (this.entityWriter.patchColumn(entitySlot as unknown as OIMEntitySlot, columnName, value, changedColumnNames)) {
            this.dispatchPatchWritten(entitySlot, undefined, changedColumnNames);
        }
        return entitySlot;
    }

    private dispatchPatchWritten(
        entitySlot: TOIMEntityContentSlot<TEntity>, patch: Partial<TEntity> | undefined, changedColumnNames: string[] | undefined,
    ): void {
        this.dispatchColumnsChanged(entitySlot, undefined, changedColumnNames);
        if (this.updatesEmptinessOnColumnWriteOf(entitySlot)) this.updateEntitySlotEmptiness(entitySlot);
        this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, patch, changedColumnNames);
    }

    private writeSlotToChannelAndReleaseIfUnheld(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(entitySlot), entitySlot);
        this.slotOwnerServiceOf(entitySlot).releaseWrittenSlotIfUnheld(entitySlot);
    }

    private dispatchContentChangeAndReleaseIfUnheld(
        entitySlot: TOIMEntityContentSlot<TEntity>, patch: Partial<TEntity> | undefined, changedColumnNames: readonly string[] | undefined,
    ): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.dispatchContentChange(entitySlot, patch, changedColumnNames);
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    public releaseSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        oimAssertSlotUnheld(entitySlot);
        this.clearEntityAndMarkColumns(entitySlot);
    }

    private clearEntityAndMarkColumns(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        const entity = (entitySlot as unknown as OIMEntitySlot<TEntity>).content;
        if (entity === undefined) return;
        this.entityWriter.clearEntity(entitySlot as unknown as OIMEntitySlot);
        this.dispatchColumnsChanged(entitySlot, entity, undefined);
    }

    private isOnFastPath(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return !this.updatesEmptinessOnColumnWriteOf(entitySlot) && !this.hasChangedColumnReaders(entitySlot);
    }

    private hasChangedColumnReaders(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return entitySlot.columnSlotStore !== undefined || (entitySlot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) !== 0
            || this.slotOwnerServiceOf(entitySlot).hasContentChangeListeners(entitySlot);
    }

    private updateEntitySlotEmptiness(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        this.slotOwnerServiceOf(entitySlot).settleEmptiness(entitySlot, this.slotEmptinessPolicy.isEmpty(entitySlot));
    }

    private writeEntityToSlot(
        entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity, changedColumnNames: string[] | undefined,
    ): boolean {
        if ((entitySlot as unknown as OIMEntitySlot<TEntity>).content === undefined) {
            this.entityWriter.fillEntity(entitySlot as unknown as OIMEntitySlot, entity);
            this.dispatchColumnsChanged(entitySlot, (entitySlot as unknown as OIMEntitySlot<TEntity>).content, undefined);
            return true;
        }
        if (!this.entityWriter.putEntity(entitySlot as unknown as OIMEntitySlot, entity, changedColumnNames)) return false;
        this.dispatchColumnsChanged(entitySlot, undefined, changedColumnNames);
        return true;
    }

    private dispatchColumnsChanged(
        entitySlot: TOIMEntityContentSlot<TEntity>, entity: object | undefined, changedColumnNames: readonly string[] | undefined,
    ): void {
        const channelSlot = oimGetChannelSlot(entitySlot);
        if (entitySlot.columnSlotStore !== undefined && (entity !== undefined || changedColumnNames !== undefined)) {
            this.slotOwnerServiceOf(entitySlot).columnSlotOwner.markColumnsChanged(entitySlot, entity, changedColumnNames, channelSlot);
        }
        if ((entitySlot.slotFlags & OIM_SLOT_FLAG_COLUMN_FILTERED_SUBSCRIBERS) !== 0 && (entity !== undefined || changedColumnNames !== undefined)) {
            OIMChannelService.INSTANCE.wakeColumnFilteredSubscribers(channelSlot, entitySlot, entity !== undefined ? undefined : changedColumnNames);
        }
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
    }
}
