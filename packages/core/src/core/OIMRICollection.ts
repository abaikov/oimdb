import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexSetBased } from '../abstract/OIMIndexSetBased';
import { OIMIndexArrayBased } from '../abstract/OIMIndexArrayBased';

export class OIMRICollection<
    TEntity extends object,
    TPk extends TOIMPk,
    TIndexName extends string,
    TIndexKey extends TOIMPk,
    TReactiveIndex extends
        | OIMReactiveIndexSetBased<
              TIndexKey,
              TPk,
              OIMIndexSetBased<TIndexKey, TPk>
          >
        | OIMReactiveIndexArrayBased<
              TIndexKey,
              TPk,
              OIMIndexArrayBased<TIndexKey, TPk>
          >,
    TReactiveIndexMap extends Record<TIndexName, TReactiveIndex> = Record<
        TIndexName,
        TReactiveIndex
    >,
> extends OIMReactiveCollection<TEntity, TPk> {
    public readonly indexes?: TReactiveIndexMap;

    constructor(
        queue: OIMEventQueue,
        opts: {
            collectionOpts?: TOIMCollectionOptions<TEntity, TPk>;
            indexes?: TReactiveIndexMap;
        }
    ) {
        super(queue, opts.collectionOpts);
        this.indexes = opts.indexes;
    }
}
