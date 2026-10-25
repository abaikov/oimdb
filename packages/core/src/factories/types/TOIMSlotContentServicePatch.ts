import type { TOIMSlotContentServiceContent } from './TOIMSlotContentServiceContent';

export type TOIMSlotContentServicePatch<TSlotContentService> =
    TOIMSlotContentServiceContent<TSlotContentService> extends readonly unknown[]
        ? TOIMSlotContentServiceContent<TSlotContentService>
        : Partial<TOIMSlotContentServiceContent<TSlotContentService>>;
