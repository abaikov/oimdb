import type { TOIMSlot } from './TOIMSlot';

export type TOIMSlotContentServiceSingleSlot<TSlotContentService> = TSlotContentService extends {
    createSingleSlot(...args: never[]): infer TSlot;
} ? Extract<TSlot, TOIMSlot> : never;
