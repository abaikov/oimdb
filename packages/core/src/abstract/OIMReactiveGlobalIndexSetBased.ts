import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndexSetBased } from './OIMGlobalIndexSetBased';
import { OIMReactiveGlobalIndex } from './OIMReactiveGlobalIndex';

export abstract class OIMReactiveGlobalIndexSetBased<
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
> extends OIMReactiveGlobalIndex<TPk, TIndex> {
    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: IOIMSingleUpdateEmitter) => TIndex
    ) {
        super(queue, createIndex);
    }

    public getPks(): Set<TPk> {
        return this.index.getPks();
    }

    public getSlots(): ReadonlySet<TOIMAnyEntitySlot<TPk>> {
        return this.index.getSlots();
    }
}
