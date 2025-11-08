import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveIndex } from '../abstract/OIMReactiveIndex';
import { OIMIndex } from '../abstract/OIMIndex';

export class OIMRICollection<
    TEntity extends object,
    TPk extends TOIMPk,
    TIndexName extends string,
    TIndexKey extends TOIMPk,
    TIndex extends OIMIndex<TIndexKey, TPk>,
    TReactiveIndex extends OIMReactiveIndex<TIndexKey, TPk, TIndex>,
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
