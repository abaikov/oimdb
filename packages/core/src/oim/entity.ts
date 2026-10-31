import type { OIMSingleEntity } from './OIMSingleEntity';
import { entity as entityIn } from '../oimdb/entity';
import { db } from './db';

export function entity<TEntity extends object>(): OIMSingleEntity<TEntity> {
    return entityIn<TEntity>(db());
}
