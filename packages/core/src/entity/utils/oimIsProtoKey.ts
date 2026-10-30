import { OIM_PROTO_KEY } from '../constants/OIM_PROTO_KEY';

export function oimIsProtoKey(name: string): boolean {
    return name === OIM_PROTO_KEY;
}