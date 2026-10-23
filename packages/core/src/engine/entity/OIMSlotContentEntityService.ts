import type { IOIMEntityWriter } from './interfaces/IOIMEntityWriter';
import type { IOIMSlotEmptiness } from '../slot/interfaces/IOIMSlotEmptiness';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { TOIMEntitySlotOwnerService } from './types/TOIMEntitySlotOwnerService';
import type { TOIMSlotContentEntityServiceOptions } from './types/TOIMSlotContentEntityServiceOptions';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../column/OIMColumnOwnerPushDriven';
import { OIMSlotOwnerService } from '../slot/OIMSlotOwnerService';
import { createOIMEntitySlot } from './utils/createOIMEntitySlot';
import { oimIsSlotEmpty } from '../slot/utils/oimIsSlotEmpty';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { OIMChannelService } from '../channel/OIMChannelService';
import { OIMContentChangeDeliveryService } from '../slot/OIMContentChangeDeliveryService';
import { OIMUnusedSlotCollectorService } from '../collector/OIMUnusedSlotCollectorService';
import { oimFillEntitiesLengthMismatchError } from '../slot/utils/oimFillEntitiesLengthMismatchError';
import { oimFillEntitiesIntoFilledCollectionError } from '../slot/utils/oimFillEntitiesIntoFilledCollectionError';
import { oimFillEntitiesKeyNamedTwiceError } from '../slot/utils/oimFillEntitiesKeyNamedTwiceError';
import { OIMSlotEmptinessByEntityPresence } from './OIMSlotEmptinessByEntityPresence';

export class OIMSlotContentEntityService<TEntity extends object, TKey, TStore = unknown, TColumnName extends string = string> {
    public readonly keyOf: (entity: TEntity) => TKey;

    public readonly slotStoreService: IOIMSlotStoreService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore>;

    private readonly slotOwnerService: TOIMEntitySlotOwnerService<TEntity, TKey, TStore, TColumnName>;

    private readonly entityWriter: IOIMEntityWriter;

    private readonly slotEmptiness: IOIMSlotEmptiness<TOIMEntitySlot<TEntity, TKey>>;

    private readonly updatesEmptinessOnColumnWrite: boolean;

    public constructor(options: TOIMSlotContentEntityServiceOptions<TEntity, TKey, TStore, TColumnName>) {
        this.keyOf = options.keyOf;
        this.slotStoreService = options.slotStoreService;
        this.entityWriter = options.entityWriter;
        this.slotEmptiness = options.slotEmptiness;
        this.updatesEmptinessOnColumnWrite = options.slotEmptiness !== OIMSlotEmptinessByEntityPresence.INSTANCE
            || options.slotReleasePolicy?.schedulesReleaseOnWrite === true
            || options.slotReleasePolicy?.releasesWrittenSlots === true || options.slotStamp !== undefined;
        this.slotOwnerService = new OIMSlotOwnerService<
            TKey, TOIMEntitySlot<TEntity, TKey>, TStore, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
        >({
            slotStamp: options.slotStamp,
            slotReleasePolicy: options.slotReleasePolicy,
            slotStoreService: options.slotStoreService,
            slotContentStrategy: {
                createSlot: (key, storeSlot, slotOwnerService) => createOIMEntitySlot<TEntity, TKey>(key, slotOwnerService, storeSlot),
                isSlotEmpty: entitySlot => this.slotEmptiness.isEmpty(entitySlot),
                hasReference: () => false,
                releaseSlotContent: entitySlot => { this.releaseSlotContent(entitySlot); },
            },
            columnOwnerOptions: options.columnOwnerOptions,
            createColumnOwner: options.createColumnOwner,
        });
    }

    public get slotOwner(): IOIMSlotOwner {
        return this.slotOwnerService;
    }

    public findEntityByKey(storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, key: TKey): TEntity | undefined {
        return this.slotStoreService.get(storeSlot.store, key)?.entity;
    }

    public upsertEntity(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, entity: TEntity,
        changedEntitySlots?: TOIMEntitySlot<TEntity, TKey>[],
    ): TOIMEntitySlot<TEntity, TKey> {
        return this.insertEntity(storeSlot, this.keyOf(entity), entity, changedEntitySlots);
    }

    public upsertEntities(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, entities: readonly TEntity[],
        changedEntitySlots?: TOIMEntitySlot<TEntity, TKey>[],
    ): TOIMEntitySlot<TEntity, TKey>[] {
        const entitySlots: TOIMEntitySlot<TEntity, TKey>[] = [];
        const channelSlot = storeSlot.channelSlot;
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            for (let i = 0; i < entities.length; i++) entitySlots.push(this.upsertEntity(storeSlot, entities[i], changedEntitySlots));
            return entitySlots;
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public insertEntity(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, key: TKey, entity: TEntity,
        changedEntitySlots?: TOIMEntitySlot<TEntity, TKey>[],
    ): TOIMEntitySlot<TEntity, TKey> {
        const filed = this.slotStoreService.get(storeSlot.store, key);
        if (filed !== undefined) {
            const landedOnFiled = this.writeEntity(filed, entity);
            if (landedOnFiled && changedEntitySlots !== undefined) changedEntitySlots.push(filed);
            return filed;
        }
        const entitySlot = this.slotOwnerService.createSlot(this.slotStoreService.ownKey(key), storeSlot as TOIMStoreSlot);
        if (this.isOnFastPath(entitySlot)) return this.insertEntityOnFastPath(storeSlot, entitySlot, entity, changedEntitySlots);
        return this.insertEntityInSubframe(storeSlot, entitySlot, entity, changedEntitySlots);
    }

    public insertEntities(storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, entities: readonly TEntity[]): void {
        this.fillEntitiesUnderKeys(storeSlot, undefined, entities);
    }

    public fillEntities(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, keys: readonly TKey[], entities: readonly TEntity[],
    ): void {
        if (keys.length !== entities.length) {
            throw oimFillEntitiesLengthMismatchError('OIMSlotContentEntityService', keys.length, entities.length);
        }
        if (this.slotStoreService.getSlotCount(storeSlot.store) !== 0) throw oimFillEntitiesIntoFilledCollectionError('OIMSlotContentEntityService');
        this.fillEntitiesUnderKeys(storeSlot, keys, entities);
    }

    private fillEntitiesUnderKeys(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, keys: readonly TKey[] | undefined, entities: readonly TEntity[],
    ): void {
        const channelSlot = storeSlot.channelSlot;
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const filedCount = this.fillEachEntity(storeSlot, keys, entities);
            if (filedCount === entities.length) return;
            const slotOwnerService = this.slotOwnerService;
            for (let i = 0; i < filedCount; i++) {
                const entitySlot = this.slotStoreService.get(storeSlot.store, keys === undefined ? this.keyOf(entities[i]) : keys[i]);
                if (entitySlot === undefined) continue;
                slotOwnerService.assertWritable(entitySlot);
                this.clearSlotContent(entitySlot);
            }
            throw oimFillEntitiesKeyNamedTwiceError('OIMSlotContentEntityService');
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public clearAllEntities(storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>): void {
        const slotOwnerService = this.slotOwnerService;
        const channelSlot = storeSlot.channelSlot;
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            for (const entitySlot of this.slotStoreService.getSlots(storeSlot.store)) {
                slotOwnerService.assertWritable(entitySlot);
                this.clearSlotContent(entitySlot);
            }
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    private fillEachEntity(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, keys: readonly TKey[] | undefined, entities: readonly TEntity[],
    ): number {
        const slotStoreService = this.slotStoreService;
        const slotOwnerService = this.slotOwnerService;
        const store = storeSlot.store;
        const isStoreEmptyAtStart = slotStoreService.getSlotCount(store) === 0;
        const filedEntitySlots: TOIMEntitySlot<TEntity, TKey>[] | undefined = isStoreEmptyAtStart ? [] : undefined;
        let i = 0;
        let filingEntitySlot: TOIMEntitySlot<TEntity, TKey> | undefined;
        try {
            for (; i < entities.length; i++) {
                filingEntitySlot = undefined;
                const key = keys === undefined ? this.keyOf(entities[i]) : keys[i];
                if (filedEntitySlots === undefined && slotStoreService.get(store, key) !== undefined) return i;
                const entitySlot = slotOwnerService.createSlot(slotStoreService.ownKey(key), storeSlot as TOIMStoreSlot);
                slotOwnerService.assertWritable(entitySlot);
                slotOwnerService.fileSlot(storeSlot, entitySlot);
                if (filedEntitySlots !== undefined) {
                    if (slotStoreService.getSlotCount(store) === filedEntitySlots.length) {
                        this.refileRepeatedKey(storeSlot, filedEntitySlots, entitySlot);
                        return i;
                    }
                    filedEntitySlots.push(entitySlot);
                }
                filingEntitySlot = entitySlot;
                this.fillSlotContent(entitySlot, entities[i]);
                if (oimIsSlotEmpty(entitySlot)) slotOwnerService.releaseSlotIfUnheld(entitySlot);
                else slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
            }
        } catch (refusal) {
            for (let j = 0; j < i; j++) {
                const entitySlot = slotStoreService.get(store, keys === undefined ? this.keyOf(entities[j]) : keys[j]);
                if (entitySlot !== undefined) slotOwnerService.releaseSlotIfUnheld(entitySlot);
            }
            if (filingEntitySlot !== undefined) slotOwnerService.releaseSlotIfUnheld(filingEntitySlot);
            throw refusal;
        }
        return entities.length;
    }

    private refileRepeatedKey(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>,
        filedEntitySlots: readonly TOIMEntitySlot<TEntity, TKey>[], repeatingEntitySlot: TOIMEntitySlot<TEntity, TKey>,
    ): void {
        const slotStoreService = this.slotStoreService;
        for (let j = 0; j < filedEntitySlots.length; j++) {
            const filedEntitySlot = filedEntitySlots[j];
            if (!slotStoreService.isSameKey(filedEntitySlot.key, repeatingEntitySlot.key)) continue;
            this.slotOwnerService.fileSlot(storeSlot, filedEntitySlot);
            return;
        }
    }

    private insertEntityOnFastPath(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, entitySlot: TOIMEntitySlot<TEntity, TKey>,
        entity: TEntity, changedEntitySlots: TOIMEntitySlot<TEntity, TKey>[] | undefined,
    ): TOIMEntitySlot<TEntity, TKey> {
        const slotOwnerService = this.slotOwnerService;
        try {
            slotOwnerService.assertWritable(entitySlot);
            this.entityWriter.fillEntity(entitySlot, entity);
            this.updateEntitySlotEmptiness(entitySlot);
            slotOwnerService.fileSlot(storeSlot, entitySlot);
            const channelSlot = storeSlot.channelSlot;
            if (oimIsSlotEmpty(entitySlot)) OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(channelSlot.collectorSlot.unusedSlotCollectorSlot, entitySlot);
            OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
        } catch (refusal) {
            slotOwnerService.releaseSlotIfUnheld(entitySlot);
            throw refusal;
        }
        if (changedEntitySlots !== undefined) changedEntitySlots.push(entitySlot);
        return entitySlot;
    }

    private insertEntityInSubframe(
        storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, entitySlot: TOIMEntitySlot<TEntity, TKey>,
        entity: TEntity, changedEntitySlots: TOIMEntitySlot<TEntity, TKey>[] | undefined,
    ): TOIMEntitySlot<TEntity, TKey> {
        const slotOwnerService = this.slotOwnerService;
        let isAnnounced = false;
        const channelSlot = storeSlot.channelSlot;
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            slotOwnerService.assertWritable(entitySlot);
            isAnnounced = this.fillSlotContent(entitySlot, entity);
            slotOwnerService.fileSlot(storeSlot, entitySlot);
            if (oimIsSlotEmpty(entitySlot)) OIMUnusedSlotCollectorService.INSTANCE.holdSlotUntilFlush(channelSlot.collectorSlot.unusedSlotCollectorSlot, entitySlot);
            else slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
        } catch (refusal) {
            this.withdrawSlotContent(entitySlot, isAnnounced);
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
            throw refusal;
        }
        try {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        } catch (refusal) {
            this.withdrawSlotContent(entitySlot, isAnnounced);
            throw refusal;
        }
        if (isAnnounced && changedEntitySlots !== undefined) changedEntitySlots.push(entitySlot);
        return entitySlot;
    }

    public writeEntity(entitySlot: TOIMEntitySlot<TEntity, TKey>, entity: TEntity): boolean {
        const slotOwnerService = this.slotOwnerService;
        slotOwnerService.assertWritable(entitySlot);
        if (entitySlot.entity !== undefined && this.isOnFastPath(entitySlot)) {
            if (!this.entityWriter.putEntity(entitySlot, entity, undefined)) return false;
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return true;
        }
        if (entitySlot.entity !== undefined && !this.updatesEmptinessOnColumnWrite) {
            const channelSlot = oimGetChannelSlot(entitySlot);
            const changedColumnNames = slotOwnerService.takeChangedColumnNames(channelSlot);
            if (!this.entityWriter.putEntity(entitySlot, entity, changedColumnNames)) return false;
            if (!slotOwnerService.isAnyColumnReferenced(entitySlot, changedColumnNames)) {
                this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
                return true;
            }
            if (!slotOwnerService.hasContentChangeListeners(entitySlot)) {
                OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
                try {
                    this.dispatchColumnsChanged(entitySlot, undefined, changedColumnNames);
                } finally {
                    OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
                }
                slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
                return true;
            }
            OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
            try {
                this.dispatchColumnsChanged(entitySlot, undefined, changedColumnNames);
                this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, entity, changedColumnNames);
            } finally {
                OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
            }
            return true;
        }
        const channelSlot = oimGetChannelSlot(entitySlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const wasEmpty = oimIsSlotEmpty(entitySlot);
            const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
                ? slotOwnerService.takeChangedColumnNames(channelSlot)
                : undefined;
            const landed = this.writeEntityWithoutSubframe(entitySlot, entity, changedColumnNames);
            if (landed) {
                this.updateEntitySlotEmptiness(entitySlot);
                this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, entity, wasEmpty ? undefined : changedColumnNames);
            }
            return landed;
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public updateEntity(entitySlot: TOIMEntitySlot<TEntity, TKey>, patch: Partial<TEntity>): TOIMEntitySlot<TEntity, TKey> {
        this.slotOwnerService.assertWritable(entitySlot);
        if (!this.isOnFastPath(entitySlot)) return this.updateEntityInSubframe(entitySlot, patch);
        if (!this.entityWriter.patchEntity(entitySlot, patch, undefined)) return entitySlot;
        this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
        return entitySlot;
    }

    public updateEntityColumn<TColumn extends keyof TEntity & string>(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, columnName: TColumn, value: TEntity[TColumn],
    ): TOIMEntitySlot<TEntity, TKey> {
        this.slotOwnerService.assertWritable(entitySlot);
        if (!this.isOnFastPath(entitySlot)) return this.updateEntityColumnOffFastPath(entitySlot, columnName, value);
        if (!this.entityWriter.patchColumn(entitySlot, columnName, value, undefined)) return entitySlot;
        this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
        return entitySlot;
    }

    public deleteEntityColumns(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, columnNames: readonly TOIMEntityColumnName<TEntity>[],
    ): TOIMEntitySlot<TEntity, TKey> {
        this.slotOwnerService.assertWritable(entitySlot);
        const channelSlot = oimGetChannelSlot(entitySlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const deletedColumnNames = this.entityWriter.deleteColumns(entitySlot, columnNames);
            if (deletedColumnNames.length !== 0) {
                this.dispatchColumnsChanged(entitySlot, undefined, deletedColumnNames);
                this.updateEntitySlotEmptiness(entitySlot);
                this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, undefined, deletedColumnNames);
            }
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
        return entitySlot;
    }

    public markEntityChanged(entitySlot: TOIMEntitySlot<TEntity, TKey>, changedColumns?: readonly (keyof TEntity & string)[]): void {
        const slotOwnerService = this.slotOwnerService;
        slotOwnerService.assertWritable(entitySlot);
        if (changedColumns !== undefined && changedColumns.length === 0) return;
        if (
            changedColumns !== undefined && !this.updatesEmptinessOnColumnWrite && entitySlot.entity !== undefined
            && !slotOwnerService.isAnyColumnReferenced(entitySlot, changedColumns)
        ) {
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return;
        }
        const channelSlot = oimGetChannelSlot(entitySlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const hasColumnSlots = slotOwnerService.hasColumnSlots(entitySlot);
            const isObserved = changedColumns === undefined || !hasColumnSlots || slotOwnerService.isAnyColumnReferenced(entitySlot, changedColumns);
            if (hasColumnSlots && isObserved) {
                slotOwnerService.columnOwner.markColumnsChanged(entitySlot, undefined, changedColumns, channelSlot);
            }
            OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
            if (this.updatesEmptinessOnColumnWrite || changedColumns === undefined || entitySlot.entity === undefined) {
                this.updateEntitySlotEmptiness(entitySlot);
            }
            if (isObserved) slotOwnerService.dispatchContentChange(entitySlot, undefined, changedColumns);
            slotOwnerService.releaseSlotIfUnheldAfterListeners(entitySlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public deleteEntity(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        this.slotOwnerService.assertWritable(entitySlot);
        this.clearSlotContent(entitySlot);
    }

    public deleteEntities(storeSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>, entitySlots: readonly TOIMEntitySlot<TEntity, TKey>[]): void {
        const channelSlot = storeSlot.channelSlot;
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            for (let i = 0; i < entitySlots.length; i++) this.deleteEntity(entitySlots[i]);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    private updateEntityInSubframe(entitySlot: TOIMEntitySlot<TEntity, TKey>, patch: Partial<TEntity>): TOIMEntitySlot<TEntity, TKey> {
        const channelSlot = oimGetChannelSlot(entitySlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
                ? this.slotOwnerService.takeChangedColumnNames(channelSlot)
                : undefined;
            if (this.entityWriter.patchEntity(entitySlot, patch, changedColumnNames)) {
                this.dispatchPatchWritten(entitySlot, patch, changedColumnNames);
            }
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
        return entitySlot;
    }

    private updateEntityColumnOffFastPath<TColumn extends keyof TEntity & string>(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, columnName: TColumn, value: TEntity[TColumn],
    ): TOIMEntitySlot<TEntity, TKey> {
        if (this.updatesEmptinessOnColumnWrite || entitySlot.entity === undefined) {
            return this.updateEntityColumnInSubframe(entitySlot, columnName, value);
        }
        const slotOwnerService = this.slotOwnerService;
        const channelSlot = oimGetChannelSlot(entitySlot);
        const columnNames = slotOwnerService.takeChangedColumnNames(channelSlot);
        columnNames.push(columnName);
        if (!slotOwnerService.isAnyColumnReferenced(entitySlot, columnNames)) {
            if (!this.entityWriter.patchColumn(entitySlot, columnName, value, undefined)) return entitySlot;
            this.writeSlotToChannelAndReleaseIfUnheld(entitySlot);
            return entitySlot;
        }
        if (slotOwnerService.hasContentChangeListeners(entitySlot)) {
            return this.updateEntityColumnInSubframe(entitySlot, columnName, value);
        }
        if (!this.entityWriter.patchColumn(entitySlot, columnName, value, undefined)) return entitySlot;
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            this.dispatchColumnsChanged(entitySlot, undefined, columnNames);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
        slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
        return entitySlot;
    }

    private updateEntityColumnInSubframe<TColumn extends keyof TEntity & string>(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, columnName: TColumn, value: TEntity[TColumn],
    ): TOIMEntitySlot<TEntity, TKey> {
        const channelSlot = oimGetChannelSlot(entitySlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const changedColumnNames = this.hasChangedColumnReaders(entitySlot)
                ? this.slotOwnerService.takeChangedColumnNames(channelSlot)
                : undefined;
            if (this.entityWriter.patchColumn(entitySlot, columnName, value, changedColumnNames)) {
                this.dispatchPatchWritten(entitySlot, undefined, changedColumnNames);
            }
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
        return entitySlot;
    }

    private dispatchPatchWritten(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, patch: Partial<TEntity> | undefined, changedColumnNames: string[] | undefined,
    ): void {
        this.dispatchColumnsChanged(entitySlot, undefined, changedColumnNames);
        if (this.updatesEmptinessOnColumnWrite) this.updateEntitySlotEmptiness(entitySlot);
        this.dispatchContentChangeAndReleaseIfUnheld(entitySlot, patch, changedColumnNames);
    }

    private writeSlotToChannelAndReleaseIfUnheld(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(oimGetChannelSlot(entitySlot), entitySlot);
        this.slotOwnerService.releaseWrittenSlotIfUnheld(entitySlot);
    }

    private dispatchContentChangeAndReleaseIfUnheld(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, patch: Partial<TEntity> | undefined, changedColumnNames: readonly string[] | undefined,
    ): void {
        const slotOwnerService = this.slotOwnerService;
        slotOwnerService.dispatchContentChange(entitySlot, patch, changedColumnNames);
        slotOwnerService.releaseSlotIfUnheldAfterListeners(entitySlot);
    }

    private releaseSlotContent(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        const entity = entitySlot.entity;
        if (entity === undefined) return;
        const channelSlot = oimGetChannelSlot(entitySlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            this.entityWriter.clearEntity(entitySlot);
            this.dispatchColumnsChanged(entitySlot, entity, undefined);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    private fillSlotContent(entitySlot: TOIMEntitySlot<TEntity, TKey>, entity: TEntity): boolean {
        const slotOwnerService = this.slotOwnerService;
        const landed = this.writeEntityWithoutSubframe(entitySlot, entity, undefined);
        slotOwnerService.settleEmptiness(entitySlot, this.slotEmptiness.isEmpty(entitySlot));
        if (landed) slotOwnerService.dispatchContentChange(entitySlot, entity);
        return landed;
    }

    private withdrawSlotContent(entitySlot: TOIMEntitySlot<TEntity, TKey>, isAnnounced: boolean): void {
        const slotOwnerService = this.slotOwnerService;
        if (isAnnounced) {
            this.releaseSlotContent(entitySlot);
            slotOwnerService.markEmptiness(entitySlot, this.slotEmptiness.isEmpty(entitySlot));
            slotOwnerService.dispatchContentChange(entitySlot);
        }
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    private clearSlotContent(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        const slotOwnerService = this.slotOwnerService;
        const channelSlot = oimGetChannelSlot(entitySlot);
        if (!this.isOnFastPath(entitySlot)) {
            OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
            try {
                this.releaseSlotContent(entitySlot);
                slotOwnerService.settleEmptiness(entitySlot, this.slotEmptiness.isEmpty(entitySlot));
                slotOwnerService.dispatchContentChange(entitySlot);
                slotOwnerService.releaseSlotIfUnheldAfterListeners(entitySlot);
            } finally {
                OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
            }
            return;
        }
        if (entitySlot.entity !== undefined) {
            this.entityWriter.clearEntity(entitySlot);
            OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
            slotOwnerService.markEmptiness(entitySlot, this.slotEmptiness.isEmpty(entitySlot));
        }
        slotOwnerService.releaseSlotIfUnheld(entitySlot);
    }

    private isOnFastPath(entitySlot: TOIMEntitySlot<TEntity, TKey>): boolean {
        return !this.updatesEmptinessOnColumnWrite && !this.hasChangedColumnReaders(entitySlot);
    }

    private hasChangedColumnReaders(entitySlot: TOIMEntitySlot<TEntity, TKey>): boolean {
        return entitySlot.columnSlotStore !== undefined || this.slotOwnerService.hasContentChangeListeners(entitySlot);
    }

    private updateEntitySlotEmptiness(entitySlot: TOIMEntitySlot<TEntity, TKey>): void {
        this.slotOwnerService.settleEmptiness(entitySlot, this.slotEmptiness.isEmpty(entitySlot));
    }

    private writeEntityWithoutSubframe(
        entitySlot: TOIMEntitySlot<TEntity, TKey>, entity: TEntity, changedColumnNames: string[] | undefined,
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
        entitySlot: TOIMEntitySlot<TEntity, TKey>, entity: object | undefined, changedColumnNames: readonly string[] | undefined,
    ): void {
        const channelSlot = oimGetChannelSlot(entitySlot);
        if (entitySlot.columnSlotStore !== undefined && (entity !== undefined || changedColumnNames !== undefined)) {
            this.slotOwnerService.columnOwner.markColumnsChanged(entitySlot, entity, changedColumnNames, channelSlot);
        }
        OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, entitySlot);
    }
}
