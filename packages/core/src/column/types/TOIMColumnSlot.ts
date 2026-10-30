import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export type TOIMColumnSlot = TOIMSlot & {
    readonly carrierSlot: TOIMSlot;
    readonly key: string;
};
