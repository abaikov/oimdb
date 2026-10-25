import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';

export type TOIMSlotContentServiceSingleSlot<TSlotContentService> = TSlotContentService extends {
    createSingleSlot(...args: never[]): infer TSlot;
} ? Extract<TSlot, TOIMSlot> : never;
