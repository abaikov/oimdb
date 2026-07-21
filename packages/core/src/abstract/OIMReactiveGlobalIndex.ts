import { TOIMKey } from '../types/TOIMKey';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { OIMCarrierSingleEmitter } from '../core/OIMCarrierSingleEmitter';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { IOIMSubscription } from '../interfaces/IOIMSubscription';
import { TOIMEventHandler } from '../types/TOIMEventHandler';
import { OIMGlobalIndex } from './OIMGlobalIndex';

/**
 * Reactive wrapper around a keyless {@link OIMGlobalIndex}. Owns a single-carrier
 * emitter (no provider, no key→carrier map), so `subscribe(handler)` is keyless
 * and directly satisfies `IOIMSelectorSourceDependency`. Mirrors
 * {@link OIMReactiveIndex} minus the key.
 */
export abstract class OIMReactiveGlobalIndex<
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndex<TPk>,
> implements IOIMSubscription
{
    public readonly index: TIndex;
    protected readonly updateEmitter: IOIMSingleUpdateEmitter;

    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: IOIMSingleUpdateEmitter) => TIndex
    ) {
        this.updateEmitter = new OIMCarrierSingleEmitter(queue);
        this.index = createIndex(this.updateEmitter);
    }

    public getEntities<TEntity extends object = object>(): (
        | TEntity
        | undefined
    )[] {
        return this.index.getEntities<TEntity>();
    }

    public get size(): number {
        return this.index.size;
    }

    public get isEmpty(): boolean {
        return this.index.isEmpty;
    }

    public subscribe(handler: TOIMEventHandler<void>): () => void {
        return this.updateEmitter.subscribe(handler);
    }

    public hasSubscriptions(): boolean {
        return this.updateEmitter.hasSubscriptions();
    }

    public getMetrics(): { totalPks: number } {
        return this.index.getMetrics();
    }

    public destroy(): void {
        this.updateEmitter.destroy();
        this.index.destroy();
    }
}
