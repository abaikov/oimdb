import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from '../core/OIMEventQueue';
import { IOIMSingleUpdateEmitter } from '../interfaces/IOIMSingleUpdateEmitter';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndexArrayBased } from './OIMGlobalIndexArrayBased';
import { OIMReactiveGlobalIndex } from './OIMReactiveGlobalIndex';

export abstract class OIMReactiveGlobalIndexArrayBased<
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
> extends OIMReactiveGlobalIndex<TPk, TIndex> {
    constructor(
        queue: OIMEventQueue,
        createIndex: (updateEmitter: IOIMSingleUpdateEmitter) => TIndex
    ) {
        super(queue, createIndex);
    }

    public getPks(): TPk[] {
        return this.index.getPks();
    }

    public getSlots(): readonly TOIMAnyEntitySlot<TPk>[] {
        return this.index.getSlots();
    }
}
