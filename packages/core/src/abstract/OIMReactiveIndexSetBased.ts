import { TOIMKey } from '../types/TOIMKey';
import { OIMIndexSetBased } from './OIMIndexSetBased';
import { TOIMPk } from '../types/TOIMPk';
import { IOIMKeyedUpdateEmitter } from '../interfaces/IOIMKeyedUpdateEmitter';
import {
    IOIMCarrierResolver,
} from '../core/OIMCarrierKeyedEmitter';
import { IOIMKeyCarrier } from '../interfaces/IOIMKeyCarrier';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMReactiveIndex } from './OIMReactiveIndex';

export abstract class OIMReactiveIndexSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMReactiveIndex<TKey, TPk, TIndex> {
    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: IOIMKeyedUpdateEmitter<TKey>) => TIndex,
        createResolver?: () => IOIMCarrierResolver<TKey, IOIMKeyCarrier<TKey>>
    ) {
        super(queue, createIndex, createResolver);
    }

    public getPksByKey(key: TKey): Set<TPk> {
        return this.index.getPksByKey(key);
    }

    public getPksByKeys(keys: readonly TKey[]): Map<TKey, Set<TPk>> {
        return this.index.getPksByKeys(keys);
    }

    public getSlotsByKey(key: TKey): ReadonlySet<TOIMAnyEntitySlot<TPk>> {
        return this.index.getSlotsByKey(key);
    }

    public getSlotsByKeys(
        keys: readonly TKey[]
    ): Map<TKey, ReadonlySet<TOIMAnyEntitySlot<TPk>>> {
        return this.index.getSlotsByKeys(keys);
    }
}
