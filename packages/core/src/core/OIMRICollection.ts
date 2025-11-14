import { TOIMCollectionOptions } from '../types/TOIMCollectionOptions';
import { TOIMPk } from '../types/TOIMPk';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveIndexSetBased } from '../abstract/OIMReactiveIndexSetBased';
import { OIMReactiveIndexArrayBased } from '../abstract/OIMReactiveIndexArrayBased';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TOIMReactiveIndex<TIndexKey extends TOIMPk, TPk extends TOIMPk> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | OIMReactiveIndexSetBased<TIndexKey, TPk, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | OIMReactiveIndexArrayBased<TIndexKey, TPk, any>;

export class OIMRICollection<
    TEntity extends object,
    TPk extends TOIMPk,
    TIndexName extends string = string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TIndexMap extends Record<TIndexName, TOIMReactiveIndex<any, TPk>> = Record<
        TIndexName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        TOIMReactiveIndex<any, TPk>
    >,
> extends OIMReactiveCollection<TEntity, TPk> {
    public readonly indexes: TIndexMap;

    constructor(
        queue: OIMEventQueue,
        opts: {
            collectionOpts?: TOIMCollectionOptions<TEntity, TPk>;
            indexes?: TIndexMap;
        }
    ) {
        super(queue, opts.collectionOpts);
        this.indexes = (opts.indexes || {}) as TIndexMap;
    }
}
