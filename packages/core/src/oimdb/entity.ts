import type { OIMSingleEntity } from './OIMSingleEntity';
import { entity as entityIn } from '../soimdb/entity';
import { getInstance } from './getInstance';

export function entity<TEntity extends object>(): OIMSingleEntity<TEntity> {
    return entityIn<TEntity>(getInstance());
}
