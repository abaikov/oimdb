import { OIM_PROTO_KEY } from '../constants/OIM_PROTO_KEY';
import { copyOIMSanitizedEntity } from './copyOIMSanitizedEntity';
import { isOIMPlainObject } from './isOIMPlainObject';

export function copyOIMOwnEntityColumns(entity: object): Record<string, unknown> {
    if (isOIMPlainObject(entity) && !Object.hasOwn(entity, OIM_PROTO_KEY)) return entity as Record<string, unknown>;
    return copyOIMSanitizedEntity(entity);
}
