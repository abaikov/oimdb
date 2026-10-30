import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
import type { TOIMSlotContentServiceKey } from './TOIMSlotContentServiceKey';

export type TOIMSlotContentServiceSlot<TSlotContentService> = TSlotContentService extends {
    createSlot(...args: never[]): infer TSlot;
} ? Extract<TSlot, TOIMKeyedSlot<TOIMSlotContentServiceKey<TSlotContentService>>> : never;
