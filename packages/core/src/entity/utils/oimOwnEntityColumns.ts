import { OIM_PROTO_KEY } from '../constants/OIM_PROTO_KEY';
import { oimSanitizedCopyEntity } from './oimSanitizedCopyEntity';
import { oimIsPlainObject } from './oimIsPlainObject';

export function oimOwnEntityColumns(entity: object): Record<string, unknown> {
    if (oimIsPlainObject(entity) && !Object.hasOwn(entity, OIM_PROTO_KEY)) return entity as Record<string, unknown>;
    return oimSanitizedCopyEntity(entity);
}
