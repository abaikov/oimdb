import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enums/EOIMIndexEventType';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

/**
 * Keyless base index: a single bucket of entity slots over the whole collection
 * ("all"), with no key dimension. Mirrors {@link OIMIndex} but holds ONE bucket
 * directly instead of a `Map<key, bucket>`, so there is no key parameter
 * anywhere on its surface. Concrete shape (ordered array vs unordered set) is
 * added by {@link OIMGlobalIndexArrayBased} / {@link OIMGlobalIndexSetBased}.
 */
export abstract class OIMGlobalIndex<TPk extends TOIMPk> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: void;
    }>();

    constructor(comparePks?: TOIMIndexComparator<TPk>) {
        this.comparePks = comparePks;
    }

    protected abstract iterateSlots(): Iterable<TOIMAnyEntitySlot<TPk>>;
    protected abstract clearBucket(): void;
    public abstract get size(): number;

    public get isEmpty(): boolean {
        return this.size === 0;
    }

    /**
     * Materializes the bucket to entities, preserving positional holes: a slot
     * whose entity is not present yet (or was removed) yields `undefined` at its
     * position rather than being dropped — mirroring {@link OIMIndex}.
     */
    public getEntities<TEntity extends object = object>(): (
        | TEntity
        | undefined
    )[] {
        const entities: (TEntity | undefined)[] = [];
        for (const slot of this.iterateSlots()) {
            entities.push(slot.item as TEntity | undefined);
        }
        return entities;
    }

    public getMetrics(): { totalPks: number } {
        return { totalPks: this.size };
    }

    public destroy(): void {
        this.emitter.offAll();
        this.clearBucket();
    }

    protected emitUpdate(): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, undefined);
    }
}
