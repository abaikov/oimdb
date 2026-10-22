import { OIM_PROTO_KEY } from '../constants/OIM_PROTO_KEY';

export function oimCopyEntitySanitized(entity: object): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...entity };
    if (Object.hasOwn(copy, OIM_PROTO_KEY)) delete copy[OIM_PROTO_KEY];
    return copy;
}
