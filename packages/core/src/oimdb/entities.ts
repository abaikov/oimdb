import type { TOIMEntityColumnName } from '@oimdb/core';
import type { OIMEntityCollection } from './OIMEntityCollection';
import { entities as entitiesIn } from '../soimdb/entities';
import { getInstance } from './getInstance';

export function entities<TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>>(
    options: Parameters<typeof entitiesIn<TEntity, TColumnName>>[1] = {},
): OIMEntityCollection<TEntity, TColumnName> {
    return entitiesIn<TEntity, TColumnName>(getInstance(), options);
}
