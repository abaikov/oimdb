import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMCarrierSingleEmitter } from '../core/OIMCarrierSingleEmitter';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { OIMGlobalIndex } from './OIMGlobalIndex';

/**
 * Reactive wrapper around a keyless {@link OIMGlobalIndex}. Owns a single-carrier
 * emitter (no provider, no key→carrier map), so `subscribe(handler)` is keyless
 * and directly satisfies `IOIMSelectorSourceDependency`. Mirrors
 * {@link OIMReactiveIndex} minus the key.
 */
export abstract class OIMReactiveGlobalIndex<
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndex<TPk, TPks, TSlots>,
    TPks = unknown,
    TSlots = unknown,
> {
    public readonly index: TIndex;
    public readonly emitter: IOIMSingleUpdateEmitter;

    constructor(
        queue: OIMEventQueue,
        createIndex: (emitter: IOIMSingleUpdateEmitter) => TIndex
    ) {
        this.emitter = new OIMCarrierSingleEmitter(queue);
        this.index = createIndex(this.emitter);
    }

    public getEntities<TEntity extends object = object>(): (
        | TEntity
        | undefined
    )[] {
        return this.index.getEntities<TEntity>();
    }

    /**
     * The two shape-carrying reads, delegated against `TPks`/`TSlots` so the
     * Set- and Array-based wrappers need no bodies of their own.
     */
    public getPks(): TPks {
        return this.index.getPks();
    }

    public getSlots(): TSlots {
        return this.index.getSlots();
    }

    public get size(): number {
        return this.index.size;
    }

    public get isEmpty(): boolean {
        return this.index.isEmpty;
    }



    public getMetrics(): { totalPks: number } {
        return this.index.getMetrics();
    }

    public destroy(): void {
        this.emitter.destroy();
        this.index.destroy();
    }
}
