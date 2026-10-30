import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotContentWriter } from '../slot/interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSingleSlotCreator } from '../slot/interfaces/IOIMSingleSlotCreator';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { TOIMEntitySlotOwnerService } from './types/TOIMEntitySlotOwnerService';
import type { TOIMSlotContentEntityServiceOptions } from './types/TOIMSlotContentEntityServiceOptions';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import { oimIsSlotEmpty } from '../slot/utils/oimIsSlotEmpty';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import { OIMSlotEntityPresenceEmptinessPolicy } from './OIMSlotEntityPresenceEmptinessPolicy';
import { createOIMEntitySlot } from './utils/createOIMEntitySlot';
import { createOIMEntityContentSlot } from './utils/createOIMEntityContentSlot';
import { oimAssertSlotUnheld } from '../slot/utils/oimAssertSlotUnheld';

export class OIMSlotContentEntityService<
    TEntity extends object, TKey extends NonNullable<unknown> = TOIMStoreKey, TColumnName extends string = string,
> implements IOIMSlotContentWriter<TOIMEntityContentSlot<TEntity>, TEntity>, IOIMSlotContentService<TOIMEntityContentSlot<TEntity>>,
    IOIMKeyedSlotCreator<TKey, TOIMEntitySlot<TEntity, TKey>>, IOIMSingleSlotCreator<TOIMEntityContentSlot<TEntity>> {
    private readonly entityWriter: IOIMEntityWriter;

    private readonly slotEmptinessPolicy: IOIMSlotEmptinessPolicy<TOIMEntityContentSlot<TEntity>>;

    private readonly isSlotEmptinessCustom: boolean;

    public constructor(options: TOIMSlotContentEntityServiceOptions<TEntity>) {
        this.entityWriter = options.entityWriter;
        this.slotEmptinessPolicy = options.slotEmptinessPolicy;
        this.isSlotEmptinessCustom = options.slotEmptinessPolicy !== OIMSlotEntityPresenceEmptinessPolicy.INSTANCE;
    }

    public createSlot(key: TKey, storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMEntitySlot<TEntity, TKey> {
        return createOIMEntitySlot<TEntity, TKey>(key, slotOwner, storeSlot);
    }

    public createSingleSlot(storeSlot: TOIMStoreSlot, slotOwner: IOIMSlotOwner): TOIMEntityContentSlot<TEntity> {
        return createOIMEntityContentSlot<TEntity>(slotOwner, storeSlot);
    }

    public isSlotEmpty(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return this.slotEmptinessPolicy.isEmpty(entitySlot);
    }

    public hasReference(): boolean {
        return false;
    }

    private updatesEmptinessOnColumnWriteOf(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return this.isSlotEmptinessCustom || this.slotOwnerServiceOf(entitySlot).settlesWrittenSlots;
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
            this.entityWriter.fillEntity(entitySlot, entity);
            this.updateEntitySlotEmptiness(entitySlot);
            slotOwnerService.fileSlot(entitySlot);
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
            slotOwnerService.fileSlot(entitySlot);
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

    public writeSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity): boolean {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.assertWritable(entitySlot);
        if (entitySlot.entity !== undefined && this.isOnFastPath(entitySlot)) {
            if (!this.entityWriter.putEntity(entitySlot, entity, undefined)) return false;
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return true;
        }
        if (entitySlot.entity !== undefined && !this.updatesEmptinessOnColumnWriteOf(entitySlot)) {
            const channelSlot = oimGetChannelSlot(entitySlot);
            const changedColumnNames = slotOwnerService.takeChangedColumnNames(channelSlot);
            if (!this.entityWriter.putEntity(entitySlot, entity, changedColumnNames)) return false;
            if (!slotOwnerService.isAnyColumnReferenced(entitySlot, changedColumnNames)) {
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
            ? slotOwnerService.takeChangedColumnNames(channelSlot)
            : undefined;
        const isLanded = this.writeEntityToSlot(entitySlot, entity, changedColumnNames);
        if (isLanded) {
            this.updateEntitySlotEmptiness(entitySlot);
            this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, entity, wasEmpty ? undefined : changedColumnNames);
        }
        return isLanded;
    }

    public updateEntity<TEntitySlot extends TOIMEntityContentSlot<TEntity>>(entitySlot: TEntitySlot, patch: Partial<TEntity>): TEntitySlot {
        this.slotOwnerServiceOf(entitySlot).assertWritable(entitySlot);
        if (!this.isOnFastPath(entitySlot)) return this.updateEntityOffFastPath(entitySlot, patch);
        if (!this.entityWriter.patchEntity(entitySlot, patch, undefined)) return entitySlot;
        this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
        return entitySlot;
    }

    public updateEntityColumn<TColumn extends keyof TEntity & string, TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnName: TColumn, value: TEntity[TColumn],
    ): TEntitySlot {
        this.slotOwnerServiceOf(entitySlot).assertWritable(entitySlot);
        if (!this.isOnFastPath(entitySlot)) return this.updateEntityColumnOffFastPath(entitySlot, columnName, value);
        if (!this.entityWriter.patchColumn(entitySlot, columnName, value, undefined)) return entitySlot;
        this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
        return entitySlot;
    }

    public deleteEntityColumns<TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnNames: readonly TOIMEntityColumnName<TEntity>[],
    ): TEntitySlot {
        this.slotOwnerServiceOf(entitySlot).assertWritable(entitySlot);
        const deletedColumnNames = this.entityWriter.deleteColumns(entitySlot, columnNames);
        if (deletedColumnNames.length !== 0) {
            this.dispatchColumnsChanged(entitySlot, undefined, deletedColumnNames);
            this.updateEntitySlotEmptiness(entitySlot);
            this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, undefined, deletedColumnNames);
        }
        return entitySlot;
    }

    public markEntityChanged(entitySlot: TOIMEntityContentSlot<TEntity>, changedColumns?: readonly (keyof TEntity & string)[]): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.assertWritable(entitySlot);
        if (changedColumns !== undefined && changedColumns.length === 0) return;
        if (
            changedColumns !== undefined && !this.updatesEmptinessOnColumnWriteOf(entitySlot) && entitySlot.entity !== undefined
            && !slotOwnerService.isAnyColumnReferenced(entitySlot, changedColumns)
        ) {
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return;
        }
        const channelSlot = oimGetChannelSlot(entitySlot);
        const hasColumnSlots = slotOwnerService.hasColumnSlots(entitySlot);
        const isObserved = changedColumns === undefined || !hasColumnSlots || slotOwnerService.isAnyColumnReferenced(entitySlot, changedColumns);
        if (hasColumnSlots && isObserved) {
            slotOwnerService.columnSlotOwner.markColumnsChanged(entitySlot, undefined, changedColumns, channelSlot);
        }
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
        if (this.updatesEmptinessOnColumnWriteOf(entitySlot) || changedColumns === undefined || entitySlot.entity === undefined) {
            this.updateEntitySlotEmptiness(entitySlot);
        }
        if (isObserved) slotOwnerService.dispatchContentChange(entitySlot, undefined, changedColumns);
        slotOwnerService.releaseSlotIfUnheldAfterListeners(entitySlot);
    }

    public clearSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        slotOwnerService.assertWritable(entitySlot);
        const channelSlot = oimGetChannelSlot(entitySlot);
        if (!this.isOnFastPath(entitySlot)) {
            this.clearEntityAndMarkColumns(entitySlot);
            slotOwnerService.settleEmptiness(entitySlot, this.slotEmptinessPolicy.isEmpty(entitySlot));
            slotOwnerService.dispatchContentChange(entitySlot);
            slotOwnerService.releaseSlotIfUnheldAfterListeners(entitySlot);
            return;
        }
        if (entitySlot.entity !== undefined) {
            this.entityWriter.clearEntity(entitySlot);
            OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
            slotOwnerService.markEmptiness(entitySlot, this.slotEmptinessPolicy.isEmpty(entitySlot));
        }
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    private updateEntityOffFastPath<TEntitySlot extends TOIMEntityContentSlot<TEntity>>(entitySlot: TEntitySlot, patch: Partial<TEntity>): TEntitySlot {
        const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
            ? this.slotOwnerServiceOf(entitySlot).takeChangedColumnNames(oimGetChannelSlot(entitySlot))
            : undefined;
        if (this.entityWriter.patchEntity(entitySlot, patch, changedColumnNames)) {
            this.dispatchPatchWritten(entitySlot, patch, changedColumnNames);
        }
        return entitySlot;
    }

    private updateEntityColumnOffFastPath<TColumn extends keyof TEntity & string, TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnName: TColumn, value: TEntity[TColumn],
    ): TEntitySlot {
        if (this.updatesEmptinessOnColumnWriteOf(entitySlot) || entitySlot.entity === undefined) {
            return this.updateEntityColumnAndDispatch(entitySlot, columnName, value);
        }
        const slotOwnerService = this.slotOwnerServiceOf(entitySlot);
        const channelSlot = oimGetChannelSlot(entitySlot);
        const columnNames = slotOwnerService.takeChangedColumnNames(channelSlot);
        columnNames.push(columnName);
        if (!slotOwnerService.isAnyColumnReferenced(entitySlot, columnNames)) {
            if (!this.entityWriter.patchColumn(entitySlot, columnName, value, undefined)) return entitySlot;
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return entitySlot;
        }
        if (slotOwnerService.hasContentChangeListeners(entitySlot)) {
            return this.updateEntityColumnAndDispatch(entitySlot, columnName, value);
        }
        if (!this.entityWriter.patchColumn(entitySlot, columnName, value, undefined)) return entitySlot;
        this.dispatchColumnsChanged(entitySlot, undefined, columnNames);
        slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
        return entitySlot;
    }

    private updateEntityColumnAndDispatch<TColumn extends keyof TEntity & string, TEntitySlot extends TOIMEntityContentSlot<TEntity>>(
        entitySlot: TEntitySlot, columnName: TColumn, value: TEntity[TColumn],
    ): TEntitySlot {
        const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
            ? this.slotOwnerServiceOf(entitySlot).takeChangedColumnNames(oimGetChannelSlot(entitySlot))
            : undefined;
        if (this.entityWriter.patchColumn(entitySlot, columnName, value, changedColumnNames)) {
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
        slotOwnerService.releaseSlotIfUnheldAfterListeners(entitySlot);
    }

    public releaseSlotContent(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        oimAssertSlotUnheld(entitySlot);
        this.clearEntityAndMarkColumns(entitySlot);
    }

    private clearEntityAndMarkColumns(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        const entity = entitySlot.entity;
        if (entity === undefined) return;
        this.entityWriter.clearEntity(entitySlot);
        this.dispatchColumnsChanged(entitySlot, entity, undefined);
    }

    private isOnFastPath(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return !this.updatesEmptinessOnColumnWriteOf(entitySlot) && !this.hasChangedColumnReaders(entitySlot);
    }

    private hasChangedColumnReaders(entitySlot: TOIMEntityContentSlot<TEntity>): boolean {
        return entitySlot.columnSlotStore !== undefined || this.slotOwnerServiceOf(entitySlot).hasContentChangeListeners(entitySlot);
    }

    private updateEntitySlotEmptiness(entitySlot: TOIMEntityContentSlot<TEntity>): void {
        this.slotOwnerServiceOf(entitySlot).settleEmptiness(entitySlot, this.slotEmptinessPolicy.isEmpty(entitySlot));
    }

    private writeEntityToSlot(
        entitySlot: TOIMEntityContentSlot<TEntity>, entity: TEntity, changedColumnNames: string[] | undefined,
    ): boolean {
        if (entitySlot.entity === undefined) {
            this.entityWriter.fillEntity(entitySlot, entity);
            this.dispatchColumnsChanged(entitySlot, entitySlot.entity, undefined);
            return true;
        }
        if (!this.entityWriter.putEntity(entitySlot, entity, changedColumnNames)) return false;
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
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
    }
}
