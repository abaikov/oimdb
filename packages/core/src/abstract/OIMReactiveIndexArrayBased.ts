import { OIMIndexArrayBased } from './OIMIndexArrayBased';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMReactiveIndex } from './OIMReactiveIndex';

export abstract class OIMReactiveIndexArrayBased<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMReactiveIndex<TKey, TPk, TIndex> {
    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: IOIMKeyedUpdateEmitter<TKey>) => TIndex
    ) {
        super(queue, createIndex);
    }

    public getPksByKey(key: TKey): TPk[] {
        return this.index.getPksByKey(key);
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, TPk[]> {
        return this.index.getPksByKeys(keys);
    }

    public getSlotsByKey(key: TKey): readonly TOIMAnyEntitySlot<TPk>[] {
        return this.index.getSlotsByKey(key);
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, readonly TOIMAnyEntitySlot<TPk>[]> {
        return this.index.getSlotsByKeys(keys);
    }
}
