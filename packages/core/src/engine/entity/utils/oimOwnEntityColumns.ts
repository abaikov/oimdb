import { OIM_PROTO_KEY } from '../constants/OIM_PROTO_KEY';
import { oimCopyEntitySanitized } from './oimCopyEntitySanitized';
import { oimIsPlain } from './oimIsPlain';

export function oimOwnEntityColumns(entity: object): Record<string, unknown> {
    if (oimIsPlain(entity) && !Object.hasOwn(entity, OIM_PROTO_KEY)) return entity as Record<string, unknown>;
    return oimCopyEntitySanitized(entity);
}
