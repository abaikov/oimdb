import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlotContentServiceKey } from './TOIMSlotContentServiceKey';

export type TOIMSlotContentServiceSlot<TSlotContentService> = TSlotContentService extends {
    createSlot(...args: never[]): infer TSlot;
} ? Extract<TSlot, TOIMKeyedSlot<TOIMSlotContentServiceKey<TSlotContentService>>> : never;
